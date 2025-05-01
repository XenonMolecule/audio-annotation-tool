import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Card, Button, Alert } from 'react-bootstrap';
import { ref, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';
import AudioRecorder from './components/AudioRecorder';

function JeopardyTask({ config, data, onUpdate, annotations, initialIndex = 0, onSync }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [buzzLatency, setBuzzLatency] = useState(null);
  const [questionStartTime, setQuestionStartTime] = useState(null);
  const [buzzed, setBuzzed] = useState(false);
  const [buzzTime, setBuzzTime] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioError, setAudioError] = useState(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [timer, setTimer] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [hasReportedIssue, setHasReportedIssue] = useState(false);
  const [reRecordingCount, setReRecordingCount] = useState(0);
  const [originalRecordingUrl, setOriginalRecordingUrl] = useState(null);
  const [isRecordingComplete, setIsRecordingComplete] = useState(false);
  const [audioLength, setAudioLength] = useState(null);
  const [audioStarted, setAudioStarted] = useState(false);
  const [showAudioRecorder, setShowAudioRecorder] = useState(false);
  const [isAudioRecorderInitialized, setIsAudioRecorderInitialized] = useState(false);
  const [shouldAutoStartRecording, setShouldAutoStartRecording] = useState(false);

  const audioRef = useRef(null);
  const timerRef = useRef(null);
  const audioRecorderRef = useRef(null);

  // Debug logging for component lifecycle
  useEffect(() => {
    console.log('JeopardyTask mounted/updated');
    console.log('Current state:', {
      isRecordingComplete,
      hasReportedIssue,
      buzzed,
      reRecordingCount,
      showAudioRecorder,
      isAudioRecorderInitialized
    });
  }, [isRecordingComplete, hasReportedIssue, buzzed, reRecordingCount, showAudioRecorder, isAudioRecorderInitialized]);

  // Separate effect to handle AudioRecorder mounting and initialization
  useEffect(() => {
    console.log('AudioRecorder mounting effect triggered');
    console.log('Current conditions:', {
      hasReportedIssue,
      buzzed,
      isRecordingComplete,
      isAudioRecorderInitialized
    });
    
    // Show AudioRecorder when we need it
    if ((hasReportedIssue || buzzed) && !isRecordingComplete) {
      console.log('Setting showAudioRecorder to true');
      setShowAudioRecorder(true);
      
      // If we're showing the recorder but it's not initialized, force initialization
      if (!isAudioRecorderInitialized) {
        console.log('AudioRecorder not initialized, forcing initialization');
        setIsAudioRecorderInitialized(true);
        // Force a remount of the AudioRecorder
        setShowAudioRecorder(false);
        setTimeout(() => {
          setShowAudioRecorder(true);
        }, 0);
      }
    } else {
      console.log('Setting showAudioRecorder to false');
      setShowAudioRecorder(false);
    }
  }, [hasReportedIssue, buzzed, isRecordingComplete, isAudioRecorderInitialized]);

  // Compute currentRow using useMemo
  const currentRow = useMemo(() => {
    if (!data || data.length === 0) return null;
    return data[currentIndex];
  }, [data, currentIndex]);

  // Get current annotation or initialize empty
  const currentAnnotation = useMemo(() => {
    const annotation = annotations[currentIndex];
    if (annotation) return annotation;
    
    return {
      buzzTime: null,
      buzzLatency: null,
      recording: null,
      originalRecording: null,
      reRecordingCount: 0,
      audioLength: null,
      metadata: {
        timestamp: Date.now()
      }
    };
  }, [annotations, currentIndex]);

  const { metadata } = currentAnnotation;

  // Load audio URL when current row changes
  useEffect(() => {
    const loadAudioUrl = async () => {
      if (!config.audio || !currentRow?.filename) {
        setAudioUrl(null);
        setAudioError(null);
        setIsLoadingAudio(false);
        return;
      }

      setIsLoadingAudio(true);
      setAudioError(null);
      
      try {
        const storageRef = ref(storage, `audio/${config.id}/${currentRow.filename}`);
        const url = await getDownloadURL(storageRef);
        setAudioUrl(url);
        setAudioError(null);
      } catch (error) {
        console.error('Error loading audio URL:', error);
        setAudioUrl(null);
        if (error.code === 'storage/object-not-found') {
          setAudioError('Audio not available');
        } else {
          setAudioError('Error loading audio');
        }
      } finally {
        setIsLoadingAudio(false);
      }
    };
    loadAudioUrl();
  }, [config, currentRow]);

  // Timer effect
  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = setInterval(() => {
        setTimer(prev => prev + 100);
      }, 100);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isTimerRunning]);

  const handleAudioPlay = () => {
    if (!questionStartTime) {
      setQuestionStartTime(Date.now());
      setIsTimerRunning(true);
    }
    setAudioStarted(true);
  };

  const handleAudioPause = () => {
    if (buzzed) {
      setIsTimerRunning(false);
    }
  };

  const handleAudioLoadedMetadata = (e) => {
    setAudioLength(e.target.duration * 1000); // Convert to milliseconds
  };

  const handleBuzzIn = () => {
    if (!audioStarted) return;
    const now = Date.now();
    const latency = now - questionStartTime;
    setBuzzLatency(latency);
    setBuzzed(true);
    setBuzzTime(now);
    setIsTimerRunning(false);
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setShouldAutoStartRecording(true);
  };

  useEffect(() => {
    if (buzzed && shouldAutoStartRecording && audioRecorderRef.current) {
      audioRecorderRef.current.startRecording();
      setShouldAutoStartRecording(false);
    }
  }, [buzzed, shouldAutoStartRecording]);

  const handleReportIssue = () => {
    console.log('handleReportIssue called');
    console.log('Current audioRecorderRef:', audioRecorderRef.current);
    setHasReportedIssue(true);
    setOriginalRecordingUrl(currentAnnotation.recording);
    setReRecordingCount(reRecordingCount + 1);
    setIsRecordingComplete(false);
    setBuzzed(true);
    setIsAudioRecorderInitialized(false);
    setShowAudioRecorder(true);
    
    if (audioRecorderRef.current) {
      console.log('Resetting recorder');
      audioRecorderRef.current.resetRecording();
    } else {
      console.log('No audioRecorderRef available');
    }
  };

  const handleRecordingComplete = async (recordingUrl) => {
    console.log('handleRecordingComplete called with URL:', recordingUrl);
    console.log('Current state:', {
      buzzTime,
      buzzLatency,
      reRecordingCount,
      originalRecordingUrl
    });
    
    const updatedAnnotation = {
      buzzTime,
      buzzLatency,
      recording: recordingUrl,
      originalRecording: originalRecordingUrl || recordingUrl,
      reRecordingCount: hasReportedIssue ? (currentAnnotation.reRecordingCount || 0) + 1 : 0,
      audioLength,
      answer: "recorded",
      metadata: {
        ...metadata,
        timestamp: Date.now()
      }
    };
    
    console.log('Updating annotation with:', updatedAnnotation);
    setIsRecordingComplete(true);
    setBuzzed(true);
    setHasReportedIssue(false);
    await onUpdate(currentIndex, updatedAnnotation);
    if (onSync) await onSync();
  };

  // Refresh local state when moving to a new row or when annotations change
  useEffect(() => {
    console.log('Current annotation changed:', currentAnnotation);
    setReRecordingCount(currentAnnotation.reRecordingCount || 0);
    setOriginalRecordingUrl(currentAnnotation.originalRecording || null);
    setIsRecordingComplete(!!currentAnnotation.recording);
    setBuzzed(!!currentAnnotation.answer && currentAnnotation.answer !== 'forfeited');
    setHasReportedIssue(false);
  }, [currentAnnotation]);

  // Forfeit handling helper
  const maybeForfeit = async () => {
    if (questionStartTime && !buzzed) {
      const confirmLeave = window.confirm(
        'You have started listening but not buzzed in. Leaving will forfeit this question. Continue?'
      );
      if (!confirmLeave) return false;
      // Record forfeited annotation
      const forfeitedAnnotation = {
        buzzTime: null,
        buzzLatency: -1,
        recording: null,
        originalRecording: null,
        reRecordingCount: 0,
        audioLength: null,
        answer: 'forfeited',
        metadata: {
          ...metadata,
          timestamp: Date.now()
        }
      };
      await onUpdate(currentIndex, forfeitedAnnotation);
      if (onSync) await onSync();
    }
    return true;
  };

  const goNext = async () => {
    console.log('goNext called, currentIndex:', currentIndex);
    if (currentIndex < data.length - 1) {
      const ok = await maybeForfeit();
      if (!ok) return;

      // If we have a recording, update the annotation to mark it as complete
      if (currentAnnotation.recording) {
        console.log('Updating annotation to completed state');
        const finalAnnotation = {
          ...currentAnnotation,
          answer: "completed", // Mark as fully complete when moving to next question
          metadata: {
            ...metadata,
            timestamp: Date.now()
          }
        };
        await onUpdate(currentIndex, finalAnnotation);
        if (onSync) await onSync();
      }

      console.log('Moving to next index:', currentIndex + 1);
      setCurrentIndex(currentIndex + 1);
      // Reset local states; useEffect on currentAnnotation will resync
      setQuestionStartTime(null);
      setTimer(0);
      setIsTimerRunning(false);
      setAudioStarted(false);
      setAudioLength(null);
      setHasReportedIssue(false);
      setBuzzed(false);
      setIsRecordingComplete(false);
    }
  };

  const goPrev = async () => {
    if (currentIndex > 0) {
      const ok = await maybeForfeit();
      if (!ok) return;
      setCurrentIndex(currentIndex - 1);
      setQuestionStartTime(null);
      setTimer(0);
      setIsTimerRunning(false);
      setAudioStarted(false);
      setAudioLength(null);
      setHasReportedIssue(false);
      setBuzzed(false);
      setIsRecordingComplete(false);
    }
  };

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (questionStartTime && !buzzed) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [questionStartTime, buzzed]);

  // On mount, if questionStartTime was set but not buzzed, save a forfeited annotation
  useEffect(() => {
    if (questionStartTime && !buzzed) {
      const forfeitedAnnotation = {
        buzzTime: null,
        buzzLatency: -1,
        recording: null,
        originalRecording: null,
        reRecordingCount: 0,
        audioLength: null,
        answer: "forfeited",
        metadata: {
          ...metadata,
          timestamp: Date.now()
        }
      };
      onUpdate(currentIndex, forfeitedAnnotation);
      if (onSync) onSync();
    }
    // Only run on mount
    // eslint-disable-next-line
  }, []);

  // Update currentIndex when initialIndex prop changes (e.g., after loading annotations)
  useEffect(() => {
    console.log('Initial index changed:', initialIndex);
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  if (!currentRow) {
    return <h5>Loading task data...</h5>;
  }

  return (
    <Card className="mb-3">
      <Card.Header>
        <h5 className="mb-0">
          Jeopardy Task - Row {currentIndex + 1} of {data.length}
        </h5>
      </Card.Header>

      <Card.Body>
        <p className="text-muted mb-3">{config.description}</p>

        {/* Timer display */}
        <div className="mb-3">
          <h4>Time: {(timer / 1000).toFixed(1)}s</h4>
        </div>

        {/* Audio player */}
        {config.audio && currentRow?.filename && (
          <div className="mb-3">
            {isLoadingAudio ? (
              <div className="text-muted">Loading audio...</div>
            ) : audioError ? (
              <Alert variant="warning">{audioError}</Alert>
            ) : audioUrl ? (
              <audio 
                ref={audioRef}
                controls 
                key={currentRow.filename} 
                style={{ width: '100%' }}
                onPlay={handleAudioPlay}
                onPause={handleAudioPause}
                onLoadedMetadata={handleAudioLoadedMetadata}
              >
                <source src={audioUrl} type="audio/mp3" />
                Your browser does not support the audio element.
              </audio>
            ) : null}
          </div>
        )}

        {/* Recording controls */}
        <div className="mb-3">
          {isRecordingComplete || currentAnnotation.recording ? (
            // Completed recording playback
            <div className="mb-3">
              <div className="mb-2 text-center text-muted">Your Recording</div>
              <audio controls src={currentAnnotation.recording} style={{ width: '100%' }} />
              {currentAnnotation.reRecordingCount > 0 && !hasReportedIssue && (
                <div className="mt-2 text-center text-muted">
                  Re-recorded {currentAnnotation.reRecordingCount} time{(currentAnnotation.reRecordingCount) !== 1 ? 's' : ''}
                </div>
              )}
              {!hasReportedIssue ? (
                <div className="mt-3">
                  <Button
                    variant="outline-warning"
                    onClick={handleReportIssue}
                    className="w-100"
                  >
                    Report Audio Issue
                  </Button>
                </div>
              ) : (
                <div className="mt-3">
                  <AudioRecorder
                    ref={audioRecorderRef}
                    onRecordingComplete={handleRecordingComplete}
                    allowReRecording={true}
                    initialDelay={500}
                  />
                </div>
              )}
            </div>
          ) : !buzzed ? (
            <Button
              variant="danger"
              onClick={handleBuzzIn}
              size="lg"
              className="w-100"
              disabled={!audioStarted || isRecordingComplete}
              style={{ opacity: audioStarted ? 1 : 0.5 }}
            >
              Buzz In!
            </Button>
          ) : (
            <div className="mb-3">
              <AudioRecorder
                ref={audioRecorderRef}
                onRecordingComplete={handleRecordingComplete}
                allowReRecording={true}
                initialDelay={500}
              />
            </div>
          )}
        </div>

        {/* Centered pagination */}
        <div className="d-flex justify-content-center align-items-center mt-4">
          <Button
            variant="secondary"
            onClick={goPrev}
            disabled={currentIndex === 0}
          >
            Previous
          </Button>
          <span className="mx-3">
            {currentIndex + 1}/{data.length}
          </span>
          <Button
            variant="secondary"
            onClick={goNext}
            disabled={currentIndex === data.length - 1}
          >
            Next
          </Button>
        </div>
      </Card.Body>
    </Card>
  );
}

export default JeopardyTask;