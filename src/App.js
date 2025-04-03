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
  const [annotations, setAnnotations] = useState({});
  const [activeTaskIndex, setActiveTaskIndex] = useState(0);

  useEffect(() => {
    fetch('/config.yaml')
      .then(res => res.text())
      .then(text => {
        const doc = yaml.load(text);
        setConfig(doc);
        doc.tasks.forEach(task => {
          fetch(task.data_file)
            .then(r => r.text())
            .then(fileText => {
              const lines = fileText.split('\n').filter(line => line.trim() !== '');
              const data = lines.map(line => JSON.parse(line));
              setDatasets(prev => ({ ...prev, [task.id]: data }));
            })
            .catch(err => console.error(`Error loading ${task.data_file}:`, err));
        });
      })
      .catch(err => console.error('Error loading config.yaml:', err));
  }, []);

  const handleAnnotationUpdate = (taskId, rowIndex, data) => {
    setAnnotations(prev => {
      const taskAnnotations = prev[taskId] || {};
      return { ...prev, [taskId]: { ...taskAnnotations, [rowIndex]: data } };
    });
  };

  const exportAnnotations = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(annotations, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', 'annotations.json');
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  if (!config) {
    return (
      <Container className="mt-3">
        <h5>Loading configuration…</h5>
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
      {/* Add horizontal padding (px-4) to the Navbar */}
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

      {/* Constrain the main content width and center it */}
      <Container className="mt-4 mb-5" style={{ maxWidth: '900px' }}>
        <TaskComponent
          config={activeTask}
          data={taskData}
          onUpdate={(rowIndex, data) => handleAnnotationUpdate(activeTask.id, rowIndex, data)}
        />

        {/* Export button at the bottom-right */}
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