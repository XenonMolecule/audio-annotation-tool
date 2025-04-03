import React, { useState, useEffect } from 'react';
import { Container, Navbar, Nav, Button, Modal } from 'react-bootstrap';
import yaml from 'js-yaml';
import ReactMarkdown from 'react-markdown';

import WerewolfTask from './WerewolfTask';
import PronunciationTask from './PronunciationTask';
import JeopardyTask from './JeopardyTask';
import EmotionTask from './EmotionTask';

function App() {
  const [config, setConfig] = useState(null);
  const [datasets, setDatasets] = useState({});
  const [annotations, setAnnotations] = useState({});
  const [activeTaskIndex, setActiveTaskIndex] = useState(0);
  const [showInstructions, setShowInstructions] = useState(false);

  // Load configuration and datasets.
  useEffect(() => {
    fetch('/audio-annotation-tool/config.yaml')
      .then((res) => res.text())
      .then((text) => {
        const doc = yaml.load(text);
        if (!doc || !doc.tasks) {
          console.error("Error: config.yaml does not contain a valid 'tasks' array.");
          return;
        }
        setConfig(doc);
        doc.tasks.forEach((task) => {
          fetch('/audio-annotation-tool/' + task.data_file)
            .then((r) => r.text())
            .then((fileText) => {
              const lines = fileText.split('\n').filter((line) => line.trim() !== '');
              const data = lines.map((line) => JSON.parse(line));
              setDatasets((prev) => ({ ...prev, [task.id]: data }));
            })
            .catch((err) => console.error(`Error loading ${task.data_file}:`, err));
        });
      })
      .catch((err) => console.error('Error loading config.yaml:', err));
  }, []);

  // Load existing annotations from localStorage.
  useEffect(() => {
    const saved = localStorage.getItem('annotations');
    if (saved) {
      try {
        setAnnotations(JSON.parse(saved));
      } catch (e) {
        console.error('Error parsing annotations from localStorage:', e);
      }
    }
  }, []);

  // Save annotations to localStorage whenever they change.
  useEffect(() => {
    localStorage.setItem('annotations', JSON.stringify(annotations));
  }, [annotations]);

  // Update annotations (called by tasks)
  const handleAnnotationUpdate = (taskId, rowIndex, data) => {
    setAnnotations((prev) => {
      const taskAnnotations = prev[taskId] || {};
      const updated = { ...prev, [taskId]: { ...taskAnnotations, [rowIndex]: data } };
      localStorage.setItem('annotations', JSON.stringify(updated));
      return updated;
    });
  };

  // Export annotations using a Blob.
  const exportAnnotations = () => {
    const saved = localStorage.getItem('annotations') || '{}';
    const blob = new Blob([saved], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = url;
    downloadAnchor.download = 'annotations.json';
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
    URL.revokeObjectURL(url);
  };

  if (!config || !config.tasks) {
    return (
      <Container className="mt-3">
        <h5>Loading configuration...</h5>
        <p>Error: config.yaml does not contain a valid tasks array.</p>
      </Container>
    );
  }

  // Ensure activeTaskIndex is within bounds.
  const tasks = config.tasks;
  const safeTaskIndex = activeTaskIndex < tasks.length ? activeTaskIndex : 0;
  const activeTask = tasks[safeTaskIndex];
  const taskData = datasets[activeTask.id] || [];

  let TaskComponent = null;
  switch (activeTask.type) {
    case 'werewolf':
      TaskComponent = WerewolfTask;
      break;
    case 'pronunciation':
      TaskComponent = PronunciationTask;
      break;
    case 'jeopardy':
      TaskComponent = JeopardyTask;
      break;
    case 'emotion':
      TaskComponent = EmotionTask;
      break;
    default:
      TaskComponent = () => <div>Task type not supported</div>;
  }

  return (
    <>
      <Navbar bg="dark" variant="dark" expand="lg" className="px-4">
        <Navbar.Brand>Audio Annotation Tool</Navbar.Brand>
        <Nav className="ml-auto">
          {tasks.map((task, index) => (
            <Nav.Link
              key={task.id}
              active={safeTaskIndex === index}
              onClick={() => setActiveTaskIndex(index)}
            >
              {task.id}
            </Nav.Link>
          ))}
        </Nav>
      </Navbar>

      <Container className="mt-4 mb-5" style={{ maxWidth: '900px' }}>
        {/* Improved Instructions Button */}
        <div className="d-flex justify-content-end mb-2">
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={() => setShowInstructions(true)}
            style={{ marginRight: '10px' }}
          >
            Instructions
          </Button>
        </div>

        <TaskComponent
          config={activeTask}
          data={taskData}
          onUpdate={(rowIndex, rowData) =>
            handleAnnotationUpdate(activeTask.id, rowIndex, rowData)
          }
          annotations={annotations[activeTask.id] || {}}
        />

        <div className="d-flex justify-content-end mt-3">
          <Button variant="primary" onClick={exportAnnotations}>
            Export Annotations
          </Button>
        </div>
      </Container>

      {/* Instructions Modal */}
      <Modal show={showInstructions} onHide={() => setShowInstructions(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Instructions for {activeTask.id}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {activeTask.instructions ? (
            <ReactMarkdown>{activeTask.instructions}</ReactMarkdown>
          ) : (
            <p>No instructions available for this task.</p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowInstructions(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}

export default App;