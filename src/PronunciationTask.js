import React, { useState, useRef } from 'react';
import { Card, Button } from 'react-bootstrap';

function PronunciationTask({ config, data, onUpdate }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [recording, setRecording] = useState(false);
  const [recordedAudio, setRecordedAudio] = useState(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunks = useRef([]);

  if (!data || data.length === 0) {
    return <h5>Loading task data…</h5>;
  }

  const currentRow = data[currentIndex];

  const blobToBase64 = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });

  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      mediaRecorderRef.current.ondataavailable = e => {
        if (e.data.size > 0) recordedChunks.current.push(e.data);
      };
      mediaRecorderRef.current.onstop = async () => {
        const blob = new Blob(recordedChunks.current, { type: 'audio/webm' });
        const base64Audio = await blobToBase64(blob);
        setRecordedAudio(base64Audio);
        onUpdate(currentIndex, { recording: base64Audio });
        recordedChunks.current = [];
      };
      mediaRecorderRef.current.start();
      setRecording(true);
    } catch (err) {
      console.error('Error accessing mic:', err);
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

  const goNext = () => {
    if (currentIndex < data.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setRecordedAudio(null);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setRecordedAudio(null);
    }
  };

  return (
    <Card className="mb-3">
      <Card.Header>
        <h5 className="mb-0">
          Pronunciation Task - Row {currentIndex + 1} of {data.length}
        </h5>
      </Card.Header>

      <Card.Body>
        <p className="text-muted mb-3">{config.description}</p>

        <div className="mb-3">
          <strong>Word:</strong> {currentRow.word}<br />
          <strong>OED:</strong> {currentRow.OED}<br />
          <strong>Region:</strong> {currentRow.region}
        </div>

        {/* Audio from dataset */}
        {config.audio && currentRow.filename && (
          <div className="mb-3">
            <audio controls style={{ width: '100%' }}>
              <source src={currentRow.filename} type="audio/wav" />
              Your browser does not support the audio element.
            </audio>
          </div>
        )}

        {/* Recording controls */}
        {config.recording && (
          <div className="mb-3">
            <Button
              variant={recording ? 'danger' : 'primary'}
              onClick={recording ? handleStopRecording : handleStartRecording}
              className="mr-2"
            >
              {recording ? 'Stop Recording' : 'Start Recording'}
            </Button>
            {recordedAudio && (
              <div className="mt-2">
                <p><strong>Your recorded audio:</strong></p>
                <audio controls src={recordedAudio} />
              </div>
            )}
          </div>
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

export default PronunciationTask;