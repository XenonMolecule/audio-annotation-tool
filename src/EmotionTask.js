import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Card, Button, Alert } from 'react-bootstrap';
import { ref, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';
import AudioRecorder from './components/AudioRecorder';

function EmotionTask({ config, data, onUpdate, annotations, initialIndex = 0, onSync }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioError, setAudioError] = useState(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  // Compute currentRow using useMemo
  const currentRow = useMemo(() => {
    if (!data || data.length === 0) return null;
    return data[currentIndex];
  }, [data, currentIndex]);

  // Get current annotation or initialize empty
  const currentAnnotation = useMemo(() => {
    const annotation = annotations[currentIndex];
    if (annotation) return annotation;
    // If nothing found, return empty annotation with metadata
    return {
      recording: null,
      status: null,
      metadata: {
        timestamp: Date.now()
      }
    };
  }, [annotations, currentIndex]);

  const { recording, status, metadata } = currentAnnotation;
  const [playbackUrl, setPlaybackUrl] = useState(currentAnnotation.recording || null);
  const audioRecorderRef = useRef(null);

  // Reset local state and load persisted recording when row changes
  useEffect(() => {
    setPlaybackUrl(currentAnnotation.recording || null);
  }, [currentIndex, currentAnnotation]);

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

  // Sync currentIndex with initialIndex prop changes
  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  if (!currentRow) {
    return <h5>Loading task data...</h5>;
  }

  const choices = Array.isArray(currentRow[config.choice_field]) ? currentRow[config.choice_field] : [];

  // Handle recording complete
  const handleRecordingComplete = async (recordingUrl) => {
    setPlaybackUrl(recordingUrl);
    const updatedAnnotation = {
      recording: recordingUrl,
      status: 'recorded',
      metadata: {
        ...metadata,
        timestamp: Date.now()
      }
    };
    await onUpdate(currentIndex, updatedAnnotation);
    if (onSync) await onSync();
  };

  // Render AudioRecorder or playback UI
  const renderAudioSection = () => {
    if (!playbackUrl) {
      return (
        <div className="mb-4">
          <AudioRecorder
            ref={audioRecorderRef}
            onRecordingComplete={handleRecordingComplete}
            allowReRecording={true}
            initialDelay={500}
          />
        </div>
      );
    } else {
      return (
        <div className="playback-controls mb-4">
          <h6>Your Recording:</h6>
          <audio controls src={playbackUrl} className="w-100" />
          <div className="d-flex justify-content-center mt-3">
            <Button
              variant="warning"
              onClick={() => {
                setPlaybackUrl(null);
                if (audioRecorderRef.current && audioRecorderRef.current.resetRecording) {
                  audioRecorderRef.current.resetRecording();
                }
                // Immediately start recording again
                setTimeout(() => {
                  if (audioRecorderRef.current && audioRecorderRef.current.startRecording) {
                    audioRecorderRef.current.startRecording();
                  }
                }, 0);
              }}
            >
              Re-Record
            </Button>
          </div>
        </div>
      );
    }
  };

  // Handle next/previous navigation
  const goNext = async () => {
    if (status === 'recorded') {
      // Mark as complete and advance to next item (if not at end)
      const updatedAnnotation = {
        ...currentAnnotation,
        status: 'complete',
        metadata: {
          ...metadata,
          confirmedAt: Date.now()
        }
      };
      await onUpdate(currentIndex, updatedAnnotation);
      if (onSync) await onSync();
      if (currentIndex < data.length - 1) {
        setCurrentIndex(currentIndex + 1);
      }
      return;
    }
    if (currentIndex < data.length - 1) {
      setCurrentIndex(currentIndex + 1);
      if (onSync) await onSync();
    }
  };

  const goPrev = async () => {
    if (currentIndex > 0) {
      if (onSync) await onSync();
      setCurrentIndex(currentIndex - 1);
    }
  };

  return (
    <Card className="mb-3">
      <Card.Header>
        <h5 className="mb-0">
          Emotion Task - Row {currentIndex + 1} of {data.length}
        </h5>
      </Card.Header>
      <Card.Body>
        <p className="mb-3 text-muted">
          Listen to the audio and read the sentence. Then record yourself responding in a way that matches the emotional context of the original utterance. You can re-record if needed.
        </p>
        {/* Audio player */}
        {config.audio && currentRow?.filename && (
          <div className="mb-3">
            {isLoadingAudio ? (
              <div className="text-muted">Loading audio...</div>
            ) : audioError ? (
              <Alert variant="warning">{audioError}</Alert>
            ) : audioUrl ? (
              <audio controls key={currentRow.filename} style={{ width: '100%' }}>
                <source src={audioUrl} type="audio/mp3" />
                Your browser does not support the audio element.
              </audio>
            ) : null}
          </div>
        )}
        <div className="mb-3">
          <strong>Sentence:</strong> {currentRow.sentence}
        </div>
        {renderAudioSection()}
      </Card.Body>
      <Card.Footer>
        <div className="d-flex justify-content-center align-items-center">
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
      </Card.Footer>
    </Card>
  );
}

export default EmotionTask;