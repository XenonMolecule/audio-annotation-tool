import React, { useState, useRef } from 'react';
import { Card, Button } from 'react-bootstrap';

function JeopardyTask({ config, data, onUpdate }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [buzzLatency, setBuzzLatency] = useState(null);
  const [questionStartTime, setQuestionStartTime] = useState(null);
  const [buzzed, setBuzzed] = useState(false);
  const audioRef = useRef(null);

  if (!data || data.length === 0) {
    return <h5>Loading task data…</h5>;
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
    onUpdate(currentIndex, { buzzLatency: latency });
    if (audioRef.current) {
      audioRef.current.pause();
    }
  };

  const goNext = () => {
    if (currentIndex < data.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setBuzzLatency(null);
      setQuestionStartTime(null);
      setBuzzed(false);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setBuzzLatency(null);
      setQuestionStartTime(null);
      setBuzzed(false);
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
            <p><strong>Your buzz latency:</strong> {buzzLatency} ms</p>
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