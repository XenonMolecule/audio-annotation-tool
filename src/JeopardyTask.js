import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Card, Button, Alert, Modal } from 'react-bootstrap';
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
  const [showForfeitModal, setShowForfeitModal] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);

  const audioRef = useRef(null);
  const timerRef = useRef(null);
  const audioRecorderRef = useRef(null);

  // Debug logging for component lifecycle
  useEffect(() => {
    console.log('JeopardyTask state update:', { currentIndex, initialIndex });
  }, [isRecordingComplete, hasReportedIssue, buzzed, reRecordingCount, showAudioRecorder, isAudioRecorderInitialized, currentIndex, initialIndex]);

  // Initialize currentIndex from initialIndex prop
  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

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
    if (!audioStarted || currentAnnotation.answer === 'forfeited') return;
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
    console.log('Recording complete - pre state update:', { currentIndex, initialIndex });
    
    // Create the updated annotation
    const updatedAnnotation = {
      buzzTime,
      buzzLatency,
      recording: recordingUrl,
      originalRecording: currentAnnotation.answer === 'forfeited' ? 'forfeit' : 
                        (originalRecordingUrl || recordingUrl),
      reRecordingCount: hasReportedIssue ? (currentAnnotation.reRecordingCount || 0) + 1 : 0,
      audioLength,
      answer: currentAnnotation.answer === 'forfeited' ? 'forfeited' : "recorded",
      metadata: {
        ...metadata,
        timestamp: Date.now()
      }
    };
    
    // Update local state first
    setIsRecordingComplete(true);
    setBuzzed(true);
    setHasReportedIssue(false);
    
    // Then update the annotation
    await onUpdate(currentIndex, updatedAnnotation);
    console.log('Recording complete - post state update:', { currentIndex, initialIndex });
    
    // Only sync if explicitly requested
    if (onSync) {
      await onSync();
    }
    
    return false; // Prevent auto-navigation
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

  // Enhanced navigation prevention and task switching detection
  useEffect(() => {
    let isUnmounting = false;

    const handleBeforeUnload = (e) => {
      if (questionStartTime && !buzzed) {
        e.preventDefault();
        // Note: Modern browsers may ignore this custom message and show their own generic message,
        // but we'll provide a detailed one for browsers that do show it
        e.returnValue = '⚠️ FORFEIT WARNING: You are in the middle of a Jeopardy question! Leaving now will count as a forfeit and you cannot attempt this question again. Click "Stay" to continue or "Leave" to forfeit.';
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden && questionStartTime && !buzzed) {
        // User switched tabs or minimized window
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
            timestamp: Date.now(),
            forfeitReason: 'tab_switch'
          }
        };
        onUpdate(currentIndex, forfeitedAnnotation);
        if (onSync) onSync();
      }
    };

    // Handle task switching and page refreshes
    const handleForfeit = (reason) => {
      if (questionStartTime && !buzzed && !isUnmounting) {
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
            timestamp: Date.now(),
            forfeitReason: reason
          }
        };
        onUpdate(currentIndex, forfeitedAnnotation);
        if (onSync) onSync();
      }
    };

    // Set up event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Handle task switching by checking if we're still mounted
    const checkMountStatus = () => {
      if (questionStartTime && !buzzed) {
        handleForfeit('task_switch');
      }
    };

    // Check mount status periodically
    const mountCheckInterval = setInterval(checkMountStatus, 1000);

    // Cleanup function
    return () => {
      isUnmounting = true;
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(mountCheckInterval);
      // Handle cleanup forfeit
      handleForfeit('component_unmount');
    };
  }, [questionStartTime, buzzed, currentIndex, metadata, onUpdate, onSync]);

  const handleForfeitCancel = () => {
    setShowForfeitModal(false);
    setPendingNavigation(null);
  };

  const goNext = async () => {
    console.log('Navigation attempt:', { currentIndex, initialIndex });
    
    if (currentIndex < data.length - 1) {
      if (questionStartTime && !buzzed) {
        setPendingNavigation('next');
        setShowForfeitModal(true);
        return;
      }

      // If we have a recording but haven't marked it complete, mark it complete and move on
      if (currentAnnotation.recording && currentAnnotation.answer === "recorded") {
        const completeAnnotation = {
          ...currentAnnotation,
          answer: "complete",
          metadata: {
            ...metadata,
            timestamp: Date.now()
          }
        };
        await onUpdate(currentIndex, completeAnnotation);
        if (onSync) await onSync();
      }

      setCurrentIndex(currentIndex + 1);
      
      // Reset local states
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

  const handleForfeitConfirm = async () => {
    if (pendingNavigation) {
      if (questionStartTime && !buzzed) {
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
            timestamp: Date.now(),
            forfeitReason: 'question_navigation'
          }
        };
        await onUpdate(currentIndex, forfeitedAnnotation);
      }

      if (onSync) await onSync();

      // Perform the navigation
      if (pendingNavigation === 'next') {
        setCurrentIndex(currentIndex + 1);
      } else if (pendingNavigation === 'prev') {
        setCurrentIndex(currentIndex - 1);
      }

      // Reset states
      setQuestionStartTime(null);
      setTimer(0);
      setIsTimerRunning(false);
      setAudioStarted(false);
      setAudioLength(null);
      setHasReportedIssue(false);
      setBuzzed(false);
      setIsRecordingComplete(false);
    }
    setShowForfeitModal(false);
    setPendingNavigation(null);
  };

  const goPrev = async () => {
    console.log('=== goPrev START ===');
    console.log('Current state:', {
      currentIndex,
      questionStartTime,
      buzzed,
      isRecordingComplete,
      showForfeitModal,
      pendingNavigation
    });
    
    if (currentIndex > 0) {
      if (questionStartTime && !buzzed) {
        console.log('Showing forfeit modal');
        setPendingNavigation('prev');
        setShowForfeitModal(true);
        return;
      }

      console.log('Moving to previous question');
      setCurrentIndex(currentIndex - 1);
      
      // Reset local states
      console.log('Resetting states');
      setQuestionStartTime(null);
      setTimer(0);
      setIsTimerRunning(false);
      setAudioStarted(false);
      setAudioLength(null);
      setHasReportedIssue(false);
      setBuzzed(false);
      setIsRecordingComplete(false);
    }
    console.log('=== goPrev END ===');
  };

  if (!currentRow) {
    return <h5>Loading task data...</h5>;
  }

  return (
    <Card className="mb-3 jeopardy-task">
      <Card.Header>
        <h5 className="mb-0">
          Jeopardy Task - Row {currentIndex + 1} of {data.length}
          {currentAnnotation.answer === 'forfeited' && (
            <span className="badge bg-danger ms-2">Forfeited</span>
          )}
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
                data-question-start-time={questionStartTime || ''}
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
          ) : currentAnnotation.answer === 'forfeited' ? (
            <div className="mb-3">
              <div className="alert alert-danger text-center mb-3">
                <h5>Question Forfeited</h5>
                <p className="mb-0">You cannot attempt this question again.</p>
              </div>
              {!hasReportedIssue ? (
                <div className="mt-3">
                  <Button
                    variant="outline-warning"
                    onClick={handleReportIssue}
                  >
                    Report Issue
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
              className="w-100 buzz-button"
              disabled={!audioStarted || isRecordingComplete}
              style={{ opacity: audioStarted ? 1 : 0.5 }}
              data-buzzed={buzzed}
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

      {/* Forfeit Warning Modal */}
      <Modal show={showForfeitModal} onHide={handleForfeitCancel} centered>
        <Modal.Header closeButton>
          <Modal.Title>⚠️ Warning: Active Jeopardy Question</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="text-center mb-4">
            <i className="fas fa-exclamation-triangle fa-3x text-warning mb-3"></i>
            <h5>You have started listening to this Jeopardy question but not buzzed in yet.</h5>
          </div>
          <div className="alert alert-warning">
            <p className="mb-0">
              If you proceed, you will forfeit this question and cannot attempt it again.
            </p>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleForfeitCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleForfeitConfirm}>
            Forfeit Question
          </Button>
        </Modal.Footer>
      </Modal>
    </Card>
  );
}

export default JeopardyTask;