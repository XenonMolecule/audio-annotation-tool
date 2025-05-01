import React, { useState, useRef, useMemo } from 'react';
import { Card, Button, Form } from 'react-bootstrap';

function JeopardyTask({ config, data, onUpdate, annotations, initialIndex = 0, onSync }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [buzzLatency, setBuzzLatency] = useState(null);
  const [questionStartTime, setQuestionStartTime] = useState(null);
  const [buzzed, setBuzzed] = useState(false);
  const audioRef = useRef(null);
  const [answer, setAnswer] = useState('');
  const [buzzTime, setBuzzTime] = useState(null);

  // Get current annotation or initialize empty
  const currentAnnotation = useMemo(() => {
    const annotation = annotations[currentIndex];
    if (annotation) return annotation;
    
    // If nothing found, return empty annotation with metadata
    return {
      answer: '',
      buzzTime: null,
      metadata: {
        timestamp: Date.now()
      }
    };
  }, [annotations, currentIndex]);

  const { metadata } = currentAnnotation;

  if (!data || data.length === 0) {
    return <h5>Loading task data...</h5>;
  }

  const currentRow = data[currentIndex];

  const handleAudioPlay = () => {
    if (!questionStartTime) {
      setQuestionStartTime(Date.now());
    }
  };

  const handleBuzzIn = () => {
    if (!questionStartTime) return;
    const now = Date.now();
    const latency = now - questionStartTime;
    setBuzzLatency(latency);
    setBuzzed(true);
    setBuzzTime(now);
    onUpdate(currentIndex, { buzzLatency: latency, buzzTime: now });
    if (audioRef.current) {
      audioRef.current.pause();
    }
  };

  const handleAnswerSubmit = async () => {
    if (!answer.trim()) return;
    
    const updatedAnnotation = {
      answer,
      buzzTime,
      buzzLatency,
      metadata: {
        ...metadata,
        timestamp: Date.now()
      }
    };
    
    await onUpdate(currentIndex, updatedAnnotation);
    if (onSync) await onSync();
    
    // Reset state for next question
    setAnswer('');
    setBuzzed(false);
    setBuzzLatency(null);
    setQuestionStartTime(null);
    setBuzzTime(null);
  };

  // Handle next/previous navigation
  const goNext = async () => {
    if (currentIndex < data.length - 1) {
      if (onSync) await onSync();
      setCurrentIndex(currentIndex + 1);
      setBuzzLatency(null);
      setQuestionStartTime(null);
      setBuzzed(false);
      setAnswer('');
      setBuzzTime(null);
    }
  };

  const goPrev = async () => {
    if (currentIndex > 0) {
      if (onSync) await onSync();
      setCurrentIndex(currentIndex - 1);
      setBuzzLatency(null);
      setQuestionStartTime(null);
      setBuzzed(false);
      setAnswer('');
      setBuzzTime(null);
    }
  };

  return (
    <Card className="mb-3">
      <Card.Header>
        <h5 className="mb-0">
          Jeopardy Task - Row {currentIndex + 1} of {data.length}
        </h5>
      </Card.Header>

      <Card.Body>
        <p className="text-muted mb-3">{config.description}</p>

        {config.audio && currentRow.filename && (
          <div className="mb-3">
            <audio
              controls
              ref={audioRef}
              onPlay={handleAudioPlay}
              style={{ width: '100%' }}
            >
              <source src={currentRow.filename} type="audio/wav" />
              Your browser does not support the audio element.
            </audio>
          </div>
        )}

        <div className="mb-3">
          <strong>Question:</strong> {currentRow.question}
        </div>

        <div className="mb-3">
          {!buzzed ? (
            <Button
              variant="danger"
              onClick={handleBuzzIn}
              disabled={!questionStartTime}
            >
              Buzz In!
            </Button>
          ) : (
            <div className="mb-3">
              <p><strong>Your buzz latency:</strong> {buzzLatency} ms</p>
              <Form.Control
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Enter your answer"
                className="mb-2"
              />
              <Button variant="primary" onClick={handleAnswerSubmit}>
                Submit Answer
              </Button>
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