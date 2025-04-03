import React, { useState } from 'react';
import { Card, Button } from 'react-bootstrap';

function EmotionTask({ config, data, onUpdate }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedEmotion, setSelectedEmotion] = useState(null);

  if (!data || data.length === 0) {
    return <h5>Loading task data…</h5>;
  }

  const currentRow = data[currentIndex];
  const choices = Array.isArray(currentRow[config.choice_field]) ? currentRow[config.choice_field] : [];

  const handleChoice = (choice) => {
    setSelectedEmotion(choice);
    onUpdate(currentIndex, { selected: choice });
  };

  const goNext = () => {
    if (currentIndex < data.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedEmotion(null);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setSelectedEmotion(null);
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

        {config.audio && currentRow.filename && (
          <div className="mb-3">
            <audio controls style={{ width: '100%' }}>
              <source src={currentRow.filename} type="audio/wav" />
              Your browser does not support the audio element.
            </audio>
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
              onClick={() => handleChoice(choice)}
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