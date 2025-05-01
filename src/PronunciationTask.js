import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, Button, ProgressBar, ToastContainer, Toast } from 'react-bootstrap';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

function PronunciationTask({ config, data, onUpdate, annotations, initialIndex = 0, onSync }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const [playbackUrl, setPlaybackUrl] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastVariant, setToastVariant] = useState('success');

  // Get existing annotation or initialize
  const currentAnnotation = useMemo(() => {
    const ann = annotations[currentIndex];
    return ann || { recording: null, metadata: { timestamp: Date.now() } };
  }, [annotations, currentIndex]);
  const { metadata } = currentAnnotation;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Reset local state and load persisted recording when row changes
  useEffect(() => {
    // Stop any ongoing recording
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setIsRecording(false);
    setIsUploading(false);
    setUploadProgress(0);
    // Load persisted recording URL
    setPlaybackUrl(currentAnnotation.recording || null);
  }, [currentIndex, currentAnnotation]);

  const startRecording = async () => {
    console.log('Starting recording...');
    const rowIndex = currentIndex;
    const rowMetadata = metadata;
    try {
      // If we're already recording, stop the current recording first
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }

      const newStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('Microphone access granted');
      
      // Store the stream in ref to prevent garbage collection
      streamRef.current = newStream;
      
      // Configure MediaRecorder with proper mime type and options
      const options = {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000
      };
      
      const recorder = new MediaRecorder(newStream, options);
      chunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = e => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstart = () => {
        console.log('Recording started');
      };

      recorder.onstop = async () => {
        console.log('Recording stopped');
        const currentChunks = chunksRef.current;
        if (currentChunks.length === 0) {
          setToastMessage('No audio recorded');
          setToastVariant('warning');
          setShowToast(true);
          setIsRecording(false);
          return;
        }
        const blob = new Blob(currentChunks, { type: 'audio/webm' });
        const tempUrl = URL.createObjectURL(blob);
        setPlaybackUrl(tempUrl);
        await uploadAudio(blob, rowIndex, rowMetadata);
        // Only sync after upload is complete, but don't show another toast
        if (onSync) {
          try {
            await onSync(true);
          } catch (err) {
            console.error('Sync error:', err);
            setToastMessage('Error syncing to cloud');
            setToastVariant('danger');
            setShowToast(true);
          }
        }
      };

      recorder.onerror = (e) => {
        console.error('MediaRecorder error:', e);
        setToastMessage('Recording error occurred');
        setToastVariant('danger');
        setShowToast(true);
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error in startRecording:', err);
      setToastMessage('Cannot access microphone');
      setToastVariant('danger');
      setShowToast(true);
    }
  };

  const stopRecording = () => {
    console.log('stopRecording called', { isRecording, hasMediaRecorder: !!mediaRecorderRef.current });
    if (mediaRecorderRef.current && isRecording) {
      console.log('Stopping active recording');
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const uploadAudio = async (blob, rowIndex, rowMetadata) => {
    setIsUploading(true);
    setToastMessage('Uploading recording...');
    setToastVariant('info');
    setShowToast(true);

    const userId = localStorage.getItem('annotationUserId') || (() => {
      const id = crypto.randomUUID();
      localStorage.setItem('annotationUserId', id);
      return id;
    })();

    const filename = `pronunciation_${data[rowIndex].word}_${Date.now()}.wav`;
    const storageRef = ref(storage, `recordings/${userId}/${filename}`);
    const task = uploadBytesResumable(storageRef, blob);

    task.on('state_changed',
      snap => {
        const progress = (snap.bytesTransferred / snap.totalBytes) * 100;
        setUploadProgress(progress);
      },
      err => {
        console.error('Upload error:', err);
        setToastMessage('Upload failed');
        setToastVariant('danger');
        setShowToast(true);
        setIsUploading(false);
      },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        await onUpdate(rowIndex, { recording: url, metadata: { ...rowMetadata, timestamp: Date.now() } });
        setPlaybackUrl(url);
        setToastMessage('Recording saved');
        setToastVariant('success');
        setShowToast(true);
        setIsUploading(false);
      }
    );
  };

  const goPrev = async () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const goNext = async () => {
    if (currentIndex < data.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  if (!data || data.length === 0) {
    return <h5>Loading task data...</h5>;
  }

  const currentRow = data[currentIndex];

  return (
    <Card className="mb-3">
      <Card.Header>
        <h5>Pronunciation Task - Row {currentIndex + 1} of {data.length}</h5>
      </Card.Header>
      <Card.Body>
        <p className="text-muted mb-3">{config.description}</p>

        {/* Word and OED information */}
        <div className="mb-3">
          <h6>Word to Pronounce:</h6>
          <p className="lead">{currentRow.word}</p>
          {currentRow.OED && (
            <div className="mb-2">
              <h6>OED Entry:</h6>
              <p>{currentRow.OED}</p>
            </div>
          )}
          {currentRow.region && (
            <div className="mb-2">
              <h6>Region:</h6>
              <p>{currentRow.region}</p>
            </div>
          )}
        </div>

        {/* Reference audio */}
        {config.audio && currentRow.filename && (
          <div className="mb-3">
            <p><strong>Reference Audio:</strong></p>
            <audio controls style={{ width: '100%' }}>
              <source src={currentRow.filename} type="audio/wav" />
              Your browser does not support audio.
            </audio>
          </div>
        )}

        {/* Recording controls */}
        {config.recording && (
          <div className="mb-3">
            <Button
              variant={isRecording ? 'danger' : 'primary'}
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isUploading}
            >
              {isRecording ? 'Stop Recording' : (playbackUrl ? 'Re-record Audio' : 'Start Recording')}
            </Button>

            {isUploading && (
              <div className="mt-2">
                <ProgressBar now={uploadProgress} label={`${Math.round(uploadProgress)}%`} />
              </div>
            )}

            {playbackUrl && !isUploading && (
              <div className="mt-2">
                <p><strong>Your Recording:</strong></p>
                <audio controls src={playbackUrl} style={{ width: '100%' }} />
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="d-flex justify-content-center mt-4">
          <Button variant="secondary" onClick={goPrev} disabled={currentIndex === 0}>Previous</Button>
          <span className="mx-3">{currentIndex + 1}/{data.length}</span>
          <Button variant="secondary" onClick={goNext} disabled={currentIndex === data.length - 1}>Next</Button>
        </div>

        {/* Toasts */}
        <ToastContainer position="top-end" className="p-3">
          <Toast show={showToast} onClose={() => setShowToast(false)} delay={3000} autohide bg={toastVariant}>
            <Toast.Header><strong className="me-auto">Notification</strong></Toast.Header>
            <Toast.Body>{toastMessage}</Toast.Body>
          </Toast>
        </ToastContainer>
      </Card.Body>
    </Card>
  );
}

export default PronunciationTask;