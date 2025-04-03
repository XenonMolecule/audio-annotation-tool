import React, { useState, useEffect } from 'react';
import { Card, Button, Collapse, Form } from 'react-bootstrap';

function WerewolfTask({ config, data, onUpdate }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [showSpeakerRename, setShowSpeakerRename] = useState(false);
  const [speakerMap, setSpeakerMap] = useState({});

  // When the current row changes, load saved annotations for that row from localStorage.
  useEffect(() => {
    const savedData = localStorage.getItem(`werewolf_annotations_row_${currentIndex}`);
    if (savedData) {
      const parsed = JSON.parse(savedData);
      setSelectedChoice(parsed.selectedChoice || null);
      setSpeakerMap(parsed.speakerMap || {});
    } else {
      setSelectedChoice(null);
      setSpeakerMap({});
    }
  }, [currentIndex]);

  // Whenever selectedChoice or speakerMap changes, save them to localStorage for this row.
  useEffect(() => {
    const saveData = { selectedChoice, speakerMap };
    localStorage.setItem(`werewolf_annotations_row_${currentIndex}`, JSON.stringify(saveData));
  }, [currentIndex, selectedChoice, speakerMap]);

  if (!data || data.length === 0) {
    return <h5>Loading task data…</h5>;
  }

  const currentRow = data[currentIndex];
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
  const handleChoice = (choice) => {
    setSelectedChoice(choice);
    onUpdate(currentIndex, { selected: choice });
  };

  const handleSpeakerChange = (label, value) => {
    setSpeakerMap((prev) => ({ ...prev, [label]: value }));
  };

  const goNext = () => {
    if (currentIndex < data.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
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
        {config.audio && currentRow.filename && (
          <div className="mb-3">
            <audio controls key={currentRow.filename} style={{ width: '100%' }}>
              <source src={`/audio-annotation-tool/data/audio/${currentRow.filename}`} type="audio/mp3" />
              Your browser does not support the audio element.
            </audio>
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
                Rename each speaker (type a new name without brackets). The transcript updates live.
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

        {/* Pagination */}
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