import React, { useState, useEffect, useCallback } from 'react';
import { Container, Navbar, Nav, NavDropdown, Button, Modal, Toast, ToastContainer, Form } from 'react-bootstrap';
import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import yaml from 'js-yaml';
import ReactMarkdown from 'react-markdown';
import { ref, uploadString, getDownloadURL, listAll } from 'firebase/storage';
import { storage } from './firebase';

import WerewolfTask from './WerewolfTask';
import PronunciationTaskBase from './PronunciationTaskBase';
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
    const baseUrl = process.env.PUBLIC_URL || '';
    fetch(`${baseUrl}/config.yaml`)
      .then((res) => res.text())
      .then((text) => {
        const doc = yaml.load(text);
        if (!doc || !doc.tasks) {
          console.error("Error: config.yaml does not contain a valid 'tasks' array.");
          return;
        }
        setConfig(doc);
        doc.tasks.forEach((task) => {
          fetch(`${baseUrl}/${task.data_file}`)
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
  const [initialTaskIndices, setInitialTaskIndices] = useState({});
  const [showForfeitWarning, setShowForfeitWarning] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState(null);

  // Extract query params
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const initialAdminMode = params.get('mode') === 'admin';
  const [isAdminMode, setIsAdminMode] = useState(initialAdminMode);
  const [adminPasswordValid, setAdminPasswordValid] = useState(() => {
    return localStorage.getItem('adminPasswordValid') === 'true';
  });
  const [showAdminPasswordModal, setShowAdminPasswordModal] = useState(isAdminMode && !adminPasswordValid);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminUserList, setAdminUserList] = useState([]);
  const [selectedAdminUser, setSelectedAdminUser] = useState(null);
  const [adminBackupDone, setAdminBackupDone] = useState(false);

  // --- ALL useEffect HOOKS AT THE TOP, BEFORE ANY RETURN ---
  // 1. On entering admin mode, save current userId
  useEffect(() => {
    if (isAdminMode && !localStorage.getItem('adminOriginalUserId')) {
      const userId = localStorage.getItem('annotationUserId');
      if (userId) {
        localStorage.setItem('adminOriginalUserId', userId);
      }
    }
  }, [isAdminMode]);

  // 2. On exit from admin mode or on page load if not in admin mode, restore original userId and reload their data
  useEffect(() => {
    const restoreOriginalUser = async () => {
      const originalUserId = localStorage.getItem('adminOriginalUserId');
      if (!isAdminMode && originalUserId) {
        // Restore userId
        localStorage.setItem('annotationUserId', originalUserId);
        // Load that user's annotation data from Firebase
        const newAnnotations = {};
        for (const task of config.tasks) {
          try {
            const url = await getDownloadURL(ref(storage, `annotations/${originalUserId}/${task.id}.json`));
            const res = await fetch(url);
            const text = await res.text();
            newAnnotations[task.id] = JSON.parse(text);
          } catch (err) {
            console.warn(`[AdminMode Restore] No data for ${task.id}:`, err);
            newAnnotations[task.id] = {};
          }
        }
        setAnnotations(newAnnotations);
        localStorage.setItem('annotations', JSON.stringify(newAnnotations));
        localStorage.removeItem('adminOriginalUserId');
        localStorage.removeItem('adminPasswordValid');
        setAdminPasswordInput('');
        setSelectedAdminUser(null);
        setAdminBackupDone(false);
        console.log('[AdminMode Restore] Restored original user data from Firebase.');
      }
    };
    restoreOriginalUser();
    // Only run on mount and when isAdminMode changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminMode]);

  useEffect(() => {
    if (isAdminMode && adminPasswordValid) {
      if (!adminBackupDone) {
        const saved = localStorage.getItem('annotations') || '{}';
        localStorage.setItem('adminBackupAnnotations', saved);
        setAdminBackupDone(true);
      }
      const annotationsRef = ref(storage, 'annotations');
      listAll(annotationsRef)
        .then(res => {
          const ids = res.prefixes.map(p => p.name);
          setAdminUserList(ids);
        })
        .catch(err => console.error('Error listing users:', err));
    }
  }, [isAdminMode, adminPasswordValid, adminBackupDone]);

  useEffect(() => {
    if (isAdminMode && adminPasswordValid && selectedAdminUser) {
      const loadAll = async () => {
        const newAnnotations = {};
        for (const task of config.tasks) {
          try {
            const url = await getDownloadURL(ref(storage, `annotations/${selectedAdminUser}/${task.id}.json`));
            const res = await fetch(url);
            const text = await res.text();
            newAnnotations[task.id] = JSON.parse(text);
          } catch (err) {
            console.warn(`No data for ${task.id}:`, err);
            newAnnotations[task.id] = {};
          }
        }
        setAnnotations(newAnnotations);
        localStorage.setItem('annotations', JSON.stringify(newAnnotations));
      };
      loadAll();
    }
  }, [selectedAdminUser, isAdminMode, adminPasswordValid, config.tasks, setAnnotations]);

  // Find first unannotated item for a task (only used for initial load)
  const findFirstUnannotatedIndex = useCallback((taskId) => {
    const taskData = datasets[taskId] || [];
    const taskAnnotations = annotations[taskId] || {};
    // If no annotations exist, return 0
    if (Object.keys(taskAnnotations).length === 0) {
      return 0;
    }
    for (let i = 0; i < taskData.length; i++) {
      // Defensive: handle string keys from localStorage
      const annotation = taskAnnotations[i] || taskAnnotations[String(i)];
      if (!annotation) {
        return i;
      }
      // Check for task-specific completion
      if (taskId === 'werewolf' && (annotation.selected == null || annotation.status !== 'complete')) {
        return i;
      }
      if ((taskId === 'pronunciation_oed' || taskId === 'pronunciation_echo') && annotation.status !== 'complete') {
        return i;
      }
      if (taskId === 'emotion' && annotation.status !== 'complete') {
        return i;
      }
      // For jeopardy, consider it annotated if it has a recording AND an answer
      // Skip forfeited questions by checking for 'forfeited' answer
      if (taskId === 'jeopardy') {
        // Skip forfeited questions
        if (annotation.answer === 'forfeited') {
          continue;
        }
        // Consider it unannotated if it has no recording or is not complete/recorded
        if (!annotation.recording || (annotation.answer !== 'complete')) {
          return i;
        }
      }
    }
    return taskData.length - 1; // Return last index if all are annotated
  }, [datasets, annotations]);

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
        setActiveTaskIndex(0);
      }
    } else {
      setActiveTaskIndex(0);
    }

    // If we're on a path-based URL, redirect to query parameter version
    const pathParts = window.location.pathname.split('/');
    if (pathParts.length > 2) {
      const pathTaskId = pathParts[2];
      if (pathTaskId) {
        const params2 = new URLSearchParams(window.location.search);
        params2.set('task', pathTaskId);
        navigate(`/audio-annotation-tool?${params2.toString()}`, { replace: true });
      }
    }

    // Initialize task indices once when datasets or tasks change
    const indices = {};
    config.tasks.forEach(task => {
      indices[task.id] = findFirstUnannotatedIndex(task.id);
    });
    setInitialTaskIndices(indices);
  }, [config.tasks, navigate, datasets, findFirstUnannotatedIndex]);

  // Initialize task indices when annotations change
  useEffect(() => {
    if (!datasets || !annotations) return;
    
    const newTaskIndices = {};
    for (const [taskId] of Object.entries(datasets)) {
      newTaskIndices[taskId] = findFirstUnannotatedIndex(taskId);
    }
    setInitialTaskIndices(newTaskIndices);
  }, [datasets, annotations, findFirstUnannotatedIndex]);

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

  // Sync annotations to cloud
  const syncToCloud = async (taskId, suppressToast = false) => {
    if (isAdminMode) {
      // Never sync to cloud in admin mode
      console.log('[AdminMode] Cloud sync is disabled in admin mode.');
      return;
    }
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
    
    // Check if we're currently in a jeopardy task with an active question
    if (activeTask.type === 'jeopardy') {
      // Get the current jeopardy task component
      const jeopardyTask = document.querySelector('.jeopardy-task');
      if (jeopardyTask) {
        // Check if there's an active question (has questionStartTime but no buzzTime)
        const questionStartTime = jeopardyTask.querySelector('audio')?.dataset.questionStartTime;
        const buzzed = jeopardyTask.querySelector('.buzz-button')?.dataset.buzzed === 'true';
        // Get the current annotation for the active Jeopardy question
        const currentJeopardyAnnotation = (annotations[activeTask.id] || {})[initialTaskIndices[activeTask.id]] || {};
        // Only show warning if not already complete, forfeited, or recorded
        const isComplete = ["complete", "forfeited", "recorded"].includes(currentJeopardyAnnotation.answer);
        if (questionStartTime && !buzzed && !isComplete) {
          // Store the pending navigation
          setPendingNavigation({ taskId, index });
          // Show the custom warning modal
          setShowForfeitWarning(true);
          return;
        }
      }
    }
    
    // If no active question or not jeopardy, proceed with navigation
    await performNavigation(taskId, index);
  };

  // Perform the actual navigation
  const performNavigation = async (taskId, index) => {
    // Sync current task before switching
    if (activeTask) {
      await syncToCloud(activeTask.id);
    }
    
    setActiveTaskIndex(index);
    // Update URL with query parameter
    const params = new URLSearchParams(window.location.search);
    params.set('task', taskId);
    const baseUrl = process.env.PUBLIC_URL || '';
    navigate(`${baseUrl}?${params.toString()}`);
  };

  // Handle forfeit confirmation
  const handleForfeitConfirm = async () => {
    if (pendingNavigation) {
      // Record forfeited annotation
      const jeopardyAnnotations = annotations[activeTask.id] || {};
      const currentJeopardyAnnotation = jeopardyAnnotations[initialTaskIndices[activeTask.id]] || {};
      
      const forfeitedAnnotation = {
        ...currentJeopardyAnnotation,
        buzzTime: null,
        buzzLatency: -1,
        recording: null,
        originalRecording: null,
        reRecordingCount: 0,
        audioLength: null,
        answer: 'forfeited',
        metadata: {
          ...currentJeopardyAnnotation.metadata,
          timestamp: Date.now(),
          forfeitReason: 'task_switch'
        }
      };
      
      // Update the annotation
      setAnnotations(prev => ({
        ...prev,
        [activeTask.id]: {
          ...prev[activeTask.id],
          [initialTaskIndices[activeTask.id]]: forfeitedAnnotation
        }
      }));
      
      // Sync the forfeit
      await syncToCloud(activeTask.id);
      
      // Perform the navigation
      await performNavigation(pendingNavigation.taskId, pendingNavigation.index);
    }
    
    // Reset state
    setShowForfeitWarning(false);
    setPendingNavigation(null);
  };

  // Handle forfeit cancellation
  const handleForfeitCancel = () => {
    setShowForfeitWarning(false);
    setPendingNavigation(null);
  };

  // Handle annotation update
  const handleAnnotationUpdate = async (taskId, rowIndex, data) => {
    console.log('Annotation update:', { taskId, rowIndex, answer: data.answer });
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

  if (!activeTask) {
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
      TaskComponent = PronunciationTaskBase;
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

  // Handle admin password submission
  const handleAdminPasswordSubmit = () => {
    if (adminPasswordInput === 'SALT') {
      localStorage.setItem('adminPasswordValid', 'true');
      setAdminPasswordValid(true);
      setShowAdminPasswordModal(false);
      // trigger backup and user load
      setIsAdminMode(true);
    } else {
      alert('Invalid password');
    }
  };

  // Handle navigation to exit admin mode
  const exitAdminMode = () => {
    params.delete('mode');
    navigate(`?${params.toString()}`, { replace: true });
    setIsAdminMode(false);
  };

  return (
    <>
      <Navbar bg="dark" variant="dark" expand="lg" className="px-4">
        <Navbar.Brand>Audio Annotation Tool{isAdminMode ? ' (Admin)' : ''}</Navbar.Brand>
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
            {isAdminMode && (
              <NavDropdown title={selectedAdminUser || 'Select User'} id="admin-user-dropdown">
                <NavDropdown.Item disabled>{'Users:'}</NavDropdown.Item>
                <Form.Select
                  size="sm"
                  value={selectedAdminUser || ''}
                  onChange={e => setSelectedAdminUser(e.target.value)}
                >
                  <option value="" disabled>Select a user</option>
                  {adminUserList.map(uid => (
                    <option key={uid} value={uid}>{uid}</option>
                  ))}
                </Form.Select>
                <NavDropdown.Divider />
                <NavDropdown.Item onClick={exitAdminMode}>Exit Admin Mode</NavDropdown.Item>
              </NavDropdown>
            )}
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
          data={datasets[activeTask.id] || []}
          onUpdate={isAdminMode ? () => {} : (rowIndex, rowData) =>
            handleAnnotationUpdate(activeTask.id, rowIndex, rowData)
          }
          annotations={annotations[activeTask.id] || {}}
          initialIndex={initialTaskIndices[activeTask.id] || 0}
          onSync={isAdminMode ? () => {} : () => syncToCloud(activeTask.id)}
          isAdminMode={isAdminMode}
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

      {/* Forfeit Warning Modal */}
      <Modal show={showForfeitWarning} onHide={handleForfeitCancel} centered>
        <Modal.Header closeButton>
          <Modal.Title>⚠️ Warning: Active Jeopardy Question</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="text-center mb-4">
            <i className="fas fa-exclamation-triangle fa-3x text-warning mb-3"></i>
            <h5>You have started listening to this Jeopardy question but not buzzed in yet.</h5>
          </div>
          <div className="alert alert-warning">
            <p className="mb-0">
              If you proceed, you will <strong>forfeit</strong> this question and cannot attempt it again.
            </p>
          </div>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleForfeitCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleForfeitConfirm}>
            Forfeit Question
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Admin password Modal */}
      <Modal show={showAdminPasswordModal} backdrop="static" centered>
        <Modal.Header>
          <Modal.Title>Enter Admin Password</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group>
            <Form.Label>Password</Form.Label>
            <Form.Control
              type="password"
              value={adminPasswordInput}
              onChange={e => setAdminPasswordInput(e.target.value)}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="primary" onClick={handleAdminPasswordSubmit}>Submit</Button>
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