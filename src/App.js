import React, { useState, useEffect } from 'react';
import { Container, Navbar, Nav, Button } from 'react-bootstrap';
import yaml from 'js-yaml';

import WerewolfTask from './WerewolfTask';
import PronunciationTask from './PronunciationTask';
import JeopardyTask from './JeopardyTask';
import EmotionTask from './EmotionTask';

function App() {
  const [config, setConfig] = useState(null);
  const [datasets, setDatasets] = useState({});
  // Annotations are stored as an object, keyed by task ID.
  const [annotations, setAnnotations] = useState({});
  const [activeTaskIndex, setActiveTaskIndex] = useState(0);

  // Load configuration and datasets.
  useEffect(() => {
    fetch('/config.yaml')
      .then((res) => res.text())
      .then((text) => {
        const doc = yaml.load(text);
        setConfig(doc);
        doc.tasks.forEach((task) => {
          fetch(task.data_file)
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

  // Load existing annotations from localStorage on mount.
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

  // Called by tasks to update the annotation for a specific row.
  const handleAnnotationUpdate = (taskId, rowIndex, data) => {
    setAnnotations((prev) => {
      const taskAnnotations = prev[taskId] || {};
      return { ...prev, [taskId]: { ...taskAnnotations, [rowIndex]: data } };
    });
    // Immediately update localStorage
    const newAnnotations = {
      ...annotations,
      [taskId]: { ...(annotations[taskId] || {}), [rowIndex]: data },
    };
    localStorage.setItem('annotations', JSON.stringify(newAnnotations));
  };

  // Export annotations directly from localStorage using a Blob.
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

  if (!config) {
    return (
      <Container className="mt-3">
        <h5>Loading configuration...</h5>
      </Container>
    );
  }

  const activeTask = config.tasks[activeTaskIndex];
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
          {config.tasks.map((task, index) => (
            <Nav.Link
              key={task.id}
              active={activeTaskIndex === index}
              onClick={() => setActiveTaskIndex(index)}
            >
              {task.id}
            </Nav.Link>
          ))}
        </Nav>
      </Navbar>

      <Container className="mt-4 mb-5" style={{ maxWidth: '900px' }}>
        <TaskComponent
          config={activeTask}
          data={taskData}
          onUpdate={(rowIndex, rowData) =>
            handleAnnotationUpdate(activeTask.id, rowIndex, rowData)
          }
        />
        <div className="d-flex justify-content-end mt-3">
          <Button variant="primary" onClick={exportAnnotations}>
            Export Annotations
          </Button>
        </div>
      </Container>
    </>
  );
}

export default App;