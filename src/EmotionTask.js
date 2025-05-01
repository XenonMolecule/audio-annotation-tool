import React, { useState, useMemo, useEffect } from 'react';
import { Card, Button, Alert } from 'react-bootstrap';
import { ref, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

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
      emotion: null,
      metadata: {
        timestamp: Date.now()
      }
    };
  }, [annotations, currentIndex]);

  const { emotion: selectedEmotion, metadata } = currentAnnotation;

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

  if (!currentRow) {
    return <h5>Loading task data...</h5>;
  }

  const choices = Array.isArray(currentRow[config.choice_field]) ? currentRow[config.choice_field] : [];

  // Handle emotion selection
  const handleEmotionSelect = async (newEmotion) => {
    const updatedAnnotation = {
      emotion: newEmotion,
      metadata: {
        ...metadata,
        timestamp: Date.now()
      }
    };
    onUpdate(currentIndex, updatedAnnotation);
    if (onSync) await onSync();
  };

  // Handle next/previous navigation
  const goNext = async () => {
    if (currentIndex < data.length - 1) {
      if (onSync) await onSync();
      setCurrentIndex(currentIndex + 1);
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
        <p className="text-muted mb-3">{config.description}</p>

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

        {/* Horizontal choices */}
        <p>Select an emotion:</p>
        <div className="d-flex flex-wrap">
          {choices.map(choice => (
            <Button
              key={choice}
              variant={selectedEmotion === choice ? 'primary' : 'outline-primary'}
              onClick={() => handleEmotionSelect(choice)}
              className="mr-2 mb-2"
            >
              {choice}
            </Button>
          ))}
        </div>
        {selectedEmotion && (
          <p className="mt-2">
            <strong>Your choice:</strong> {selectedEmotion}
          </p>
        )}

        {/* Centered pagination */}
        <div className="d-flex justify-content-center align-items-center mt-4">
          <Button variant="secondary" onClick={goPrev} disabled={currentIndex === 0}>
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

export default EmotionTask;