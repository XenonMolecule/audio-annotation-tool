import React, { useState } from 'react';
import { Card, Button } from 'react-bootstrap';

function WerewolfTask({ config, data, onUpdate }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState(null);

  if (!data || data.length === 0) {
    return <h5>Loading task data…</h5>;
  }

  const currentRow = data[currentIndex];
  const choices = Array.isArray(currentRow[config.choice_field]) ? currentRow[config.choice_field] : [];
  const extraChoices = config.extra_choices || [];
  const allChoices = [...choices, ...extraChoices];

  const transcriptText = currentRow.transcript || '[Auto-generated transcript not available]';

  const handleChoice = (choice) => {
    setSelectedChoice(choice);
    onUpdate(currentIndex, { selected: choice });
  };

  const goNext = () => {
    if (currentIndex < data.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setSelectedChoice(null);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setSelectedChoice(null);
    }
  };

  return (
    <Card className="mb-3">
      <Card.Header>
        <h5 className="mb-0">
          Werewolf Task - Row {currentIndex + 1} of {data.length}
        </h5>
      </Card.Header>

      <Card.Body>
        <p className="text-muted mb-3">{config.description}</p>

        <div
          style={{
            backgroundColor: '#f8f9fa',
            border: '1px solid #dee2e6',
            padding: '10px',
            borderRadius: '4px',
            maxHeight: '120px',
            overflowY: 'auto',
            marginBottom: '1rem',
          }}
        >
          <strong>Transcript:</strong>
          <div className="mt-1" style={{ whiteSpace: 'pre-wrap' }}>
            {transcriptText}
          </div>
        </div>

        {/* Note the updated audio source path */}
        {config.audio && currentRow.filename && (
          <div className="mb-3">
            <audio controls style={{ width: '100%' }}>
              <source src={`/data/audio/${currentRow.filename}`} type="audio/wav" />
              Your browser does not support the audio element.
            </audio>
          </div>
        )}

        <div className="mt-3">
          <p>Please select the most likely werewolf:</p>
          <div className="d-flex justify-content-center flex-wrap mt-3">
            {allChoices.map(choice => (
              <Button
                key={choice}
                variant={selectedChoice === choice ? 'primary' : 'outline-primary'}
                onClick={() => handleChoice(choice)}
                className="m-2"
              >
                {choice}
              </Button>
            ))}
          </div>
          {selectedChoice && (
            <p className="mt-2">
              <strong>Your choice:</strong> {selectedChoice}
            </p>
          )}
        </div>

        <div className="d-flex justify-content-center align-items-center mt-4">
          <Button variant="secondary" onClick={goPrev} disabled={currentIndex === 0}>
            Previous
          </Button>
          <span className="mx-3">
            {currentIndex + 1}/{data.length}
          </span>
          <Button variant="secondary" onClick={goNext} disabled={currentIndex === data.length - 1}>
            Next
          </Button>
        </div>
      </Card.Body>
    </Card>
  );
}

export default WerewolfTask;