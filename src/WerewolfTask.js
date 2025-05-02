import React, { useState, useMemo, useEffect } from 'react';
import { Card, Button, Collapse, Form, Alert } from 'react-bootstrap';
import { ref, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

function WerewolfTask({ config, data, onUpdate, annotations, initialIndex = 0, onSync }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [showSpeakerRename, setShowSpeakerRename] = useState(false);
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
      selected: null,
      speakerMap: {},
      metadata: {
        timestamp: Date.now()
      }
    };
  }, [annotations, currentIndex]);

  const { selected, speakerMap, metadata } = currentAnnotation;

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

  // Sync currentIndex with initialIndex if it changes
  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  if (!currentRow) {
    return <h5>Loading task data...</h5>;
  }

  // Handle choice selection
  const handleChoice = async (choice) => {
    const updatedAnnotation = {
      selected: choice,
      status: 'selected',
      speakerMap,
      metadata: {
        ...metadata,
        timestamp: Date.now()
      }
    };
    onUpdate(currentIndex, updatedAnnotation);
    if (onSync) await onSync();
  };

  // Handle speaker name change
  const handleSpeakerChange = async (label, value) => {
    const updatedAnnotation = {
      selected,
      speakerMap: {
        ...speakerMap,
        [label]: value
      },
      metadata: {
        ...metadata,
        timestamp: Date.now()
      }
    };
    onUpdate(currentIndex, updatedAnnotation);
    if (onSync) await onSync();
  };

  const rawTranscript = currentRow.transcript || '[Auto-generated transcript not available]';

  // Extract unique speaker tags using a regex that matches any text after "[SPEAKER_" until "]".
  const extractSpeakers = (transcript) => {
    const regex = /\[SPEAKER_[^\]]+\]/g;
    const found = transcript.match(regex) || [];
    return Array.from(new Set(found)).sort((a, b) => a.localeCompare(b));
  };

  const uniqueSpeakers = extractSpeakers(rawTranscript);

  // Format transcript: replace each speaker tag with its renamed version if available,
  // then insert a newline before any tag not already preceded by one.
  const formatTranscript = (transcript) => {
    const renameRegex = /\[SPEAKER_[^\]]+\]/g;
    let renamed = transcript.replace(renameRegex, (match) => {
      const newName = speakerMap[match]?.trim();
      return newName && newName.length > 0 ? `[${newName}]` : match;
    });
    // Insert a newline before any bracketed tag not already preceded by a newline.
    renamed = renamed.replace(/(?<!\n)\s*(\[[^\]]+\])/g, "\n$1").trim();
    return renamed;
  };

  const formattedTranscript = formatTranscript(rawTranscript);

  // Voting choices.
  const choices = Array.isArray(currentRow[config.choice_field])
    ? currentRow[config.choice_field]
    : [];
  const extraChoices = config.extra_choices || [];
  const allChoices = [...choices, ...extraChoices];

  // Handlers.
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

  // Unified Next button handler
  const handleNext = async () => {
    if (currentAnnotation.status === 'selected') {
      const updatedAnnotation = {
        ...currentAnnotation,
        status: 'complete',
        metadata: {
          ...currentAnnotation.metadata,
          confirmedAt: Date.now()
        }
      };
      await onUpdate(currentIndex, updatedAnnotation);
      if (onSync) await onSync();
      if (currentIndex < data.length - 1) {
        setCurrentIndex(currentIndex + 1);
      }
    } else if (currentIndex < data.length - 1) {
      setCurrentIndex(currentIndex + 1);
      if (onSync) await onSync();
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

        {/* Combined roles display */}
        <p>
          <strong>Roles:</strong> {(() => {
            const fields = config.combined_roles_fields || ["startRoles", "endRoles"];
            const defaults = config.default_roles || ["werewolf", "villager"];
            let roles = new Set();
            fields.forEach((field) => {
              if (currentRow[field] && Array.isArray(currentRow[field])) {
                currentRow[field].forEach((role) => roles.add(role.toLowerCase()));
              }
            });
            defaults.forEach((role) => roles.add(role.toLowerCase()));
            return Array.from(roles).sort((a, b) => a.localeCompare(b)).join(", ");
          })()}
        </p>

        {/* Transcript display */}
        <div
          style={{
            backgroundColor: '#f8f9fa',
            border: '1px solid #dee2e6',
            padding: '10px',
            borderRadius: '4px',
            maxHeight: '150px',
            overflowY: 'auto',
            marginBottom: '1rem',
            whiteSpace: 'pre-wrap'
          }}
        >
          <strong>Transcript:</strong>
          <div className="mt-1">{formattedTranscript}</div>
        </div>

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

        {/* Speaker renaming dropdown (after transcript and audio, before voting) */}
        <div className="mb-3">
          <Button variant="secondary" onClick={() => setShowSpeakerRename(!showSpeakerRename)}>
            {showSpeakerRename ? "Hide Speaker Rename" : "Show Speaker Rename"}
          </Button>
          <Collapse in={showSpeakerRename}>
            <div className="mt-3">
              <p style={{ fontStyle: 'italic' }}>
                [Optional] Rename each speaker (type a new name without brackets). The transcript updates live.
              </p>
              {uniqueSpeakers.map((label) => (
                <div key={label} className="mb-2">
                  <strong>{label}:</strong>
                  <Form.Control
                    type="text"
                    placeholder="Enter new name"
                    value={speakerMap[label] || ""}
                    onChange={(e) => handleSpeakerChange(label, e.target.value)}
                    style={{ maxWidth: "300px", display: "inline-block", marginLeft: "10px" }}
                  />
                </div>
              ))}
            </div>
          </Collapse>
        </div>

        {/* Voting choices */}
        <div className="mt-3">
          <p>Please select the most likely werewolf:</p>
          <div className="d-flex justify-content-center flex-wrap mt-3">
            {allChoices.map(choice => (
              <Button
                key={choice}
                variant={selected === choice ? 'primary' : 'outline-primary'}
                onClick={() => handleChoice(choice)}
                className="m-2"
              >
                {choice}
              </Button>
            ))}
          </div>
          {selected && (
            <p className="mt-2">
              <strong>Your choice:</strong> {selected}
            </p>
          )}
        </div>

        {/* Pagination */}
        <div className="d-flex justify-content-center align-items-center mt-4">
          <Button variant="secondary" onClick={goPrev} disabled={currentIndex === 0}>
            Previous
          </Button>
          <span className="mx-3">
            {currentIndex + 1}/{data.length}
          </span>
          <Button variant="secondary" onClick={handleNext} disabled={currentIndex === data.length - 1}>
            Next
          </Button>
        </div>
      </Card.Body>
    </Card>
  );
}

export default WerewolfTask;