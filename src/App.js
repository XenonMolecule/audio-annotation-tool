import React, { useState, useEffect } from 'react';
import { Container, Navbar, Nav, Button, Modal, Toast, ToastContainer } from 'react-bootstrap';
import { BrowserRouter as Router, Routes, Route, useParams, useNavigate } from 'react-router-dom';
import yaml from 'js-yaml';
import ReactMarkdown from 'react-markdown';
import { ref, uploadString } from 'firebase/storage';
import { storage } from './firebase';

import WerewolfTask from './WerewolfTask';
import PronunciationTask from './PronunciationTask';
import JeopardyTask from './JeopardyTask';
import EmotionTask from './EmotionTask';

function App() {
  const [config, setConfig] = useState(null);
  const [datasets, setDatasets] = useState({});
  const [annotations, setAnnotations] = useState({});
  const [showInstructions, setShowInstructions] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastVariant, setToastVariant] = useState('success');

  // Generate or retrieve user ID
  const generateUserId = () => {
    let userId = localStorage.getItem('annotationUserId');
    if (!userId) {
      userId = crypto.randomUUID();
      localStorage.setItem('annotationUserId', userId);
    }
    return userId;
  };

  // Get backup threshold for a task (10% of total items)
  const getBackupThreshold = (taskId) => {
    const taskData = datasets[taskId] || [];
    return Math.max(1, Math.floor(taskData.length * 0.1));
  };

  // Check if we should create a backup
  // eslint-disable-next-line no-unused-vars
  const shouldCreateBackup = (taskId) => {
    const taskAnnotations = annotations[taskId] || {};
    const annotationCount = Object.keys(taskAnnotations).length;
    const lastBackupCount = parseInt(localStorage.getItem(`backupCount_${taskId}`) || '0', 10);
    const threshold = getBackupThreshold(taskId);
    
    return annotationCount >= lastBackupCount + threshold;
  };

  // Create a backup
  // eslint-disable-next-line no-unused-vars
  const createBackup = async (taskId) => {
    try {
      const userId = generateUserId();
      const timestamp = new Date().toISOString();
      const backupRef = ref(storage, `annotations/${userId}/backups/${taskId}_${timestamp}.json`);
      const taskAnnotations = annotations[taskId] || {};
      await uploadString(backupRef, JSON.stringify(taskAnnotations), 'raw');
      
      // Update last backup count
      const annotationCount = Object.keys(taskAnnotations).length;
      localStorage.setItem(`backupCount_${taskId}`, annotationCount.toString());
      
      setToastMessage(`Backup created for ${taskId}`);
      setToastVariant('success');
      setShowToast(true);
    } catch (error) {
      console.error('Error creating backup:', error);
    }
  };

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
        const parsed = JSON.parse(saved);
        // Ensure we have a valid object structure
        if (typeof parsed === 'object' && parsed !== null) {
          setAnnotations(parsed);
        } else {
          console.error('Invalid annotations format in localStorage');
          setAnnotations({});
        }
      } catch (e) {
        console.error('Error parsing annotations from localStorage:', e);
        setAnnotations({});
      }
    }
  }, []);

  // Save annotations to localStorage whenever they change.
  useEffect(() => {
    if (Object.keys(annotations).length > 0) {
      localStorage.setItem('annotations', JSON.stringify(annotations));
    }
  }, [annotations]);

  if (!config || !config.tasks) {
    return (
      <Container className="mt-3">
        <h5>Loading configuration...</h5>
        <p>Error: config.yaml does not contain a valid tasks array.</p>
      </Container>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/audio-annotation-tool/*" element={
          <AppContent 
            config={config}
            datasets={datasets}
            annotations={annotations}
            setAnnotations={setAnnotations}
            showInstructions={showInstructions}
            setShowInstructions={setShowInstructions}
            isSyncing={isSyncing}
            setIsSyncing={setIsSyncing}
            showToast={showToast}
            setShowToast={setShowToast}
            toastMessage={toastMessage}
            setToastMessage={setToastMessage}
            toastVariant={toastVariant}
            setToastVariant={setToastVariant}
          />
        } />
      </Routes>
    </Router>
  );
}

function AppContent({ 
  config, 
  datasets, 
  annotations, 
  setAnnotations,
  showInstructions,
  setShowInstructions,
  isSyncing,
  setIsSyncing,
  showToast,
  setShowToast,
  toastMessage,
  setToastMessage,
  toastVariant,
  setToastVariant
}) {
  const navigate = useNavigate();
  const [activeTaskIndex, setActiveTaskIndex] = useState(0);
  const [isSingleTaskMode, setIsSingleTaskMode] = useState(false);

  // Handle all task and mode initialization
  useEffect(() => {
    // Get query parameters
    const params = new URLSearchParams(window.location.search);
    const taskId = params.get('task');
    const isOnlyMode = params.get('mode') === 'only';
    setIsSingleTaskMode(isOnlyMode);

    // Find the correct task index based on query parameter
    if (taskId) {
      const taskIndex = config.tasks.findIndex(task => task.id === taskId);
      if (taskIndex !== -1) {
        setActiveTaskIndex(taskIndex);
      } else {
        // If taskId is invalid, default to first task
        setActiveTaskIndex(0);
      }
    } else {
      // If no taskId in query, default to first task
      setActiveTaskIndex(0);
    }

    // If we're on a path-based URL, redirect to query parameter version
    const pathParts = window.location.pathname.split('/');
    if (pathParts.length > 2) {
      const pathTaskId = pathParts[2];
      if (pathTaskId) {
        const params = new URLSearchParams(window.location.search);
        params.set('task', pathTaskId);
        navigate(`/audio-annotation-tool?${params.toString()}`, { replace: true });
      }
    }
  }, [config.tasks, navigate]);

  // Generate or retrieve user ID
  const generateUserId = () => {
    let userId = localStorage.getItem('annotationUserId');
    if (!userId) {
      userId = crypto.randomUUID();
      localStorage.setItem('annotationUserId', userId);
    }
    return userId;
  };

  // Get backup threshold for a task (10% of total items)
  const getBackupThreshold = (taskId) => {
    const taskData = datasets[taskId] || [];
    return Math.max(1, Math.floor(taskData.length * 0.1));
  };

  // Check if we should create a backup
  // eslint-disable-next-line no-unused-vars
  const shouldCreateBackup = (taskId) => {
    const taskAnnotations = annotations[taskId] || {};
    const annotationCount = Object.keys(taskAnnotations).length;
    const lastBackupCount = parseInt(localStorage.getItem(`backupCount_${taskId}`) || '0', 10);
    const threshold = getBackupThreshold(taskId);
    
    return annotationCount >= lastBackupCount + threshold;
  };

  // Create a backup
  // eslint-disable-next-line no-unused-vars
  const createBackup = async (taskId) => {
    try {
      const userId = generateUserId();
      const timestamp = new Date().toISOString();
      const backupRef = ref(storage, `annotations/${userId}/backups/${taskId}_${timestamp}.json`);
      const taskAnnotations = annotations[taskId] || {};
      await uploadString(backupRef, JSON.stringify(taskAnnotations), 'raw');
      
      // Update last backup count
      const annotationCount = Object.keys(taskAnnotations).length;
      localStorage.setItem(`backupCount_${taskId}`, annotationCount.toString());
      
      setToastMessage(`Backup created for ${taskId}`);
      setToastVariant('success');
      setShowToast(true);
    } catch (error) {
      console.error('Error creating backup:', error);
    }
  };

  // Find first unannotated item for a task
  const findFirstUnannotatedIndex = (taskId) => {
    const taskData = datasets[taskId] || [];
    const taskAnnotations = annotations[taskId] || {};
    
    for (let i = 0; i < taskData.length; i++) {
      const annotation = taskAnnotations[i];
      if (!annotation) return i;
      
      // Check for task-specific completion
      if (taskId === 'werewolf' && !annotation.selected) return i;
      if (taskId === 'pronunciation' && !annotation.recording) return i;
      if (taskId === 'emotion' && !annotation.emotion) return i;
      if (taskId === 'jeopardy' && !annotation.answer) return i;
    }
    return 0;
  };

  // Sync annotations to cloud
  const syncToCloud = async (taskId, suppressToast = false) => {
    if (isSyncing) return;
    
    setIsSyncing(true);
    try {
      const userId = generateUserId();
      const taskAnnotations = annotations[taskId] || {};
      
      // Log the sync attempt
      console.log('Syncing to cloud:', {
        taskId,
        userId,
        annotationCount: Object.keys(taskAnnotations).length,
        storageBucket: storage.bucket
      });
      
      const annotationsRef = ref(storage, `annotations/${userId}/${taskId}.json`);
      await uploadString(annotationsRef, JSON.stringify(taskAnnotations), 'raw');
      
      // Check if we should create a backup
      if (shouldCreateBackup(taskId)) {
        await createBackup(taskId);
      }
    } catch (error) {
      console.error('Error syncing to cloud:', error);
      if (!suppressToast) {
        setToastMessage(`Error syncing to cloud: ${error.message}`);
        setToastVariant('danger');
        setShowToast(true);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle task navigation
  const handleTaskNavigation = async (taskId, index) => {
    if (isSingleTaskMode) return; // Disable navigation in single-task mode
    
    // Sync current task before switching
    if (activeTask) {
      await syncToCloud(activeTask.id);
    }
    
    setActiveTaskIndex(index);
    // Update URL with query parameter
    const params = new URLSearchParams(window.location.search);
    params.set('task', taskId);
    navigate(`/audio-annotation-tool?${params.toString()}`);
  };

  // Handle annotation update
  const handleAnnotationUpdate = async (taskId, rowIndex, data) => {
    setAnnotations((prev) => {
      const taskAnnotations = prev[taskId] || {};
      const updated = { ...prev, [taskId]: { ...taskAnnotations, [rowIndex]: data } };
      
      // Save to localStorage
      localStorage.setItem('annotations', JSON.stringify(updated));
      
      // Check if we should create a backup
      if (shouldCreateBackup(taskId)) {
        createBackup(taskId);
      }
      
      return updated;
    });
  };

  const tasks = config.tasks;
  const safeTaskIndex = activeTaskIndex < tasks.length ? activeTaskIndex : 0;
  const activeTask = tasks[safeTaskIndex];
  const taskData = datasets[activeTask.id] || [];

  if (!taskData || taskData.length === 0) {
    return (
      <Container className="mt-3">
        <h5>Loading task data...</h5>
        <p>Please wait while we load the data for {activeTask.id}.</p>
      </Container>
    );
  }

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
        {!isSingleTaskMode && (
          <Nav className="ml-auto">
            {tasks.map((task, index) => (
              <Nav.Link
                key={task.id}
                active={safeTaskIndex === index}
                onClick={() => handleTaskNavigation(task.id, index)}
              >
                {task.id}
              </Nav.Link>
            ))}
          </Nav>
        )}
      </Navbar>

      <Container className="mt-4 mb-5" style={{ maxWidth: '900px' }}>
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
          initialIndex={findFirstUnannotatedIndex(activeTask.id)}
          onSync={() => syncToCloud(activeTask.id)}
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

      <ToastContainer position="top-end" className="p-3">
        <Toast 
          show={showToast} 
          onClose={() => setShowToast(false)} 
          delay={3000} 
          autohide
          className={toastVariant === 'success' ? 'bg-success-subtle' : 
                    toastVariant === 'warning' ? 'bg-warning-subtle' : 
                    'bg-danger-subtle'}
        >
          <Toast.Header className={toastVariant === 'success' ? 'bg-success-subtle' : 
                                 toastVariant === 'warning' ? 'bg-warning-subtle' : 
                                 'bg-danger-subtle'}>
            <strong className="me-auto">{toastVariant === 'success' ? 'Success' : 
                                      toastVariant === 'warning' ? 'Warning' : 
                                      'Error'}</strong>
          </Toast.Header>
          <Toast.Body className={toastVariant === 'success' ? 'text-success' : 
                               toastVariant === 'warning' ? 'text-warning' : 
                               'text-danger'}>
            {toastMessage}
          </Toast.Body>
        </Toast>
      </ToastContainer>
    </>
  );
}

export default App;