import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, Button, ProgressBar, ToastContainer, Toast, Alert } from 'react-bootstrap';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from './firebase';

function PronunciationTaskBase({ config, data, onUpdate, annotations, initialIndex = 0, onSync, isAdminMode }) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isRecording, setIsRecording] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const [playbackUrl, setPlaybackUrl] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastVariant, setToastVariant] = useState('success');
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioError, setAudioError] = useState(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  // Compute currentRow using useMemo
  const currentRow = useMemo(() => {
    if (!data || data.length === 0) return null;
    return data[currentIndex];
  }, [data, currentIndex]);

  // Get existing annotation or initialize
  const currentAnnotation = useMemo(() => {
    const ann = annotations[currentIndex];
    return ann || { recording: null, status: null, metadata: { timestamp: Date.now() } };
  }, [annotations, currentIndex]);
  const { metadata, status } = currentAnnotation;

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
        const storageRef = ref(storage, `audio/pronunciation/${currentRow.filename}`);
        const url = await getDownloadURL(storageRef);
        setAudioUrl(url);
        setAudioError(null);
      } catch (error) {
        console.error('Error loading audio URL:', error);
        setAudioUrl(null);
        if (error.code === 'storage/object-not-found') {
          setAudioError('Reference audio not available');
        } else {
          setAudioError('Error loading audio');
        }
      } finally {
        setIsLoadingAudio(false);
      }
    };
    loadAudioUrl();
  }, [config, currentRow]);

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

  // Sync currentIndex with initialIndex if it changes
  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  if (!currentRow) {
    return <h5>Loading task data...</h5>;
  }

  const startRecording = async () => {
    console.log('Starting recording...');
    const rowIndex = currentIndex;
    const rowMetadata = metadata;
    try {
      setIsInitializing(true);
      // If we're already recording, stop the current recording first
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }

      const newStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('Microphone access granted');
      
      // Store the stream in ref to prevent garbage collection
      streamRef.current = newStream;
      
      // Comprehensive browser detection
      const userAgent = navigator.userAgent.toLowerCase();
      const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent) && 
                      !userAgent.includes('chrome') &&
                      !userAgent.includes('crios') &&
                      !userAgent.includes('edg');
      
      if (isSafari) {
        console.log('Using Web Audio API for Safari');
        // Use Web Audio API for Safari
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioContext.createMediaStreamSource(newStream);
        const processor = audioContext.createScriptProcessor(1024, 1, 1);
        const chunks = [];
        let hasValidAudio = false;
        
        processor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          const hasAudio = inputData.some(sample => Math.abs(sample) > 0.01);
          if (hasAudio) {
            hasValidAudio = true;
          }
          chunks.push(new Float32Array(inputData));
        };
        
        source.connect(processor);
        processor.connect(audioContext.destination);
        
        mediaRecorderRef.current = {
          context: audioContext,
          source: source,
          processor: processor,
          chunks: chunks,
          hasValidAudio: hasValidAudio,
          stop: () => {
            processor.disconnect();
            source.disconnect();
            audioContext.close();
            
            if (!hasValidAudio) {
              setToastMessage('No audio detected in recording');
              setToastVariant('warning');
              setShowToast(true);
              setIsRecording(false);
              return;
            }
            
            const wavBlob = convertToWav(chunks, audioContext.sampleRate);
            const tempUrl = URL.createObjectURL(wavBlob);
            setPlaybackUrl(tempUrl);
            uploadAudio(wavBlob, rowIndex, rowMetadata);
          }
        };
        
        await new Promise(resolve => setTimeout(resolve, 500));
        setIsInitializing(false);
        setIsRecording(true);
      } else {
        const options = {
          mimeType: 'audio/webm',
          audioBitsPerSecond: 128000
        };
        
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options.mimeType = 'audio/mp4';
        }
        
        const recorder = new MediaRecorder(newStream, options);
        chunksRef.current = [];
        let hasValidAudio = false;
        
        recorder.ondataavailable = e => {
          if (e.data.size > 0) {
            chunksRef.current.push(e.data);
            hasValidAudio = true;
          }
        };

        recorder.onstart = () => {
          recorder.requestData();
        };

        recorder.onstop = async () => {
          const currentChunks = chunksRef.current;
          if (currentChunks.length === 0 || !hasValidAudio) {
            setToastMessage('No audio detected in recording');
            setToastVariant('warning');
            setShowToast(true);
            setIsRecording(false);
            return;
          }
          
          const blob = new Blob(currentChunks, { type: options.mimeType });
          const tempUrl = URL.createObjectURL(blob);
          setPlaybackUrl(tempUrl);
          await uploadAudio(blob, rowIndex, rowMetadata);
        };

        mediaRecorderRef.current = recorder;
        recorder.start(50);
        await new Promise(resolve => setTimeout(resolve, 500));
        setIsInitializing(false);
        setIsRecording(true);
      }
    } catch (err) {
      console.error('Error in startRecording:', err);
      setToastMessage('Error accessing microphone');
      setToastVariant('danger');
      setShowToast(true);
      setIsInitializing(false);
    }
  };

  const convertToWav = (chunks, sampleRate) => {
    const buffer = new ArrayBuffer(44 + chunks.length * 2);
    const view = new DataView(buffer);
    
    // Write WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + chunks.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, chunks.length * 2, true);
    
    // Write audio data
    let offset = 44;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      for (let j = 0; j < chunk.length; j++) {
        const s = Math.max(-1, Math.min(1, chunk[j]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        offset += 2;
      }
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
  };

  const writeString = (view, offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const uploadAudio = async (blob, rowIndex, rowMetadata) => {
    try {
      setIsUploading(true);
      setUploadProgress(0);
      
      const timestamp = Date.now();
      const filename = `${currentRow.filename}_${timestamp}.wav`;
      const storageRef = ref(storage, `recordings/${config.id}/${filename}`);
      
      const uploadTask = uploadBytesResumable(storageRef, blob);
      
      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => {
          console.error('Upload error:', error);
          setToastMessage('Error uploading recording');
          setToastVariant('danger');
          setShowToast(true);
          setIsUploading(false);
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          const newAnnotation = {
            recording: downloadURL,
            status: 'recorded',
            metadata: {
              ...rowMetadata,
              timestamp: timestamp,
              filename: filename
            }
          };
          onUpdate(rowIndex, newAnnotation);
          setToastMessage('Recording uploaded successfully');
          setToastVariant('success');
          setShowToast(true);
          setIsUploading(false);
        }
      );
    } catch (error) {
      console.error('Error in uploadAudio:', error);
      setToastMessage('Error uploading recording');
      setToastVariant('danger');
      setShowToast(true);
      setIsUploading(false);
    }
  };

  // Confirm and move to next item
  const confirmAndNext = async () => {
    const newAnnotation = {
      ...currentAnnotation,
      status: 'complete',
      metadata: {
        ...currentAnnotation.metadata,
        confirmedAt: Date.now()
      }
    };
    await onUpdate(currentIndex, newAnnotation);
    if (currentIndex < data.length - 1) {
      setCurrentIndex(currentIndex + 1);
      if (onSync) {
        await onSync(currentIndex + 1);
      }
    }
  };

  // Unified Next button handler
  const handleNext = async () => {
    if (status === 'recorded') {
      await confirmAndNext();
    } else if (currentIndex < data.length - 1) {
      setCurrentIndex(currentIndex + 1);
      if (onSync) {
        await onSync(currentIndex + 1);
      }
    }
  };

  const goPrev = async () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      if (onSync) {
        await onSync(currentIndex - 1);
      }
    }
  };

  const renderTaskContent = () => {
    return (
      <div className="mb-4">
        <h5>Word: {currentRow.word}</h5>
        <div className="mb-2"><strong>Region:</strong> {currentRow.region}</div>
        {config.showOED && (
          <div className="oed-entry">
            <h6>OED Entry:</h6>
            <pre>{currentRow.OED}</pre>
          </div>
        )}
        {config.showAudio && (
          <div className="reference-audio">
            <h6>Reference Audio:</h6>
            {isLoadingAudio ? (
              <p>Loading reference audio...</p>
            ) : audioError ? (
              <Alert variant="danger">{audioError}</Alert>
            ) : audioUrl ? (
              <audio controls src={audioUrl} className="w-100" />
            ) : null}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="pronunciation-task">
      <ToastContainer position="top-end" className="p-3">
        <Toast show={showToast} onClose={() => setShowToast(false)} delay={3000} autohide>
          <Toast.Header>
            <strong className="me-auto">Notification</strong>
          </Toast.Header>
          <Toast.Body className={toastVariant === 'danger' ? 'text-danger' : ''}>
            {toastMessage}
          </Toast.Body>
        </Toast>
      </ToastContainer>

      <Card className="mb-4">
        <Card.Header>
          <h4>Pronunciation Task ({config.showOED ? 'OED' : 'Echo'} Version) - Row {currentIndex + 1} of {data.length}</h4>
          <p className="mb-0">
            {config.showOED 
              ? 'Please pronounce the word based on the OED entry.'
              : 'Please listen to the reference audio and repeat the pronunciation.'}
          </p>
        </Card.Header>
        <Card.Body>
          {renderTaskContent()}

          <div className="recording-controls mb-4">
            {isAdminMode ? (
              currentAnnotation.recording ? (
                <>
                  <div className="mb-2 text-center text-muted">User Recording</div>
                  <audio controls src={currentAnnotation.recording} className="w-100" />
                </>
              ) : (
                <Alert variant="info">No recording available</Alert>
              )
            ) : (
              <>
                {!isRecording && !isInitializing && !currentAnnotation.recording && (
                  <Button
                    variant="primary"
                    onClick={startRecording}
                    disabled={isUploading}
                  >
                    Start Recording
                  </Button>
                )}
                {!isRecording && !isInitializing && currentAnnotation.recording && status !== 'recorded' && status !== 'complete' && (
                  <Button
                    variant="primary"
                    onClick={startRecording}
                    disabled={isUploading}
                  >
                    Re-Record
                  </Button>
                )}
                {isRecording && (
                  <Button
                    variant="danger"
                    onClick={stopRecording}
                    disabled={isUploading}
                  >
                    Stop Recording
                  </Button>
                )}
                {isInitializing && (
                  <Button variant="secondary" disabled>
                    Initializing...
                  </Button>
                )}
              </>
            )}
          </div>

          {isUploading && (
            <div className="mb-4">
              <ProgressBar now={uploadProgress} label={`${Math.round(uploadProgress)}%`} />
              <p className="text-center mt-2">Uploading recording...</p>
            </div>
          )}

          {!isAdminMode && playbackUrl && (
            <div className="playback-controls mb-4">
              <h6>Your Recording:</h6>
              <audio controls src={playbackUrl} className="w-100" />
              {/* Only show Re-Record if a recording exists */}
              {currentAnnotation.recording && (
                <div className="d-flex justify-content-center mt-3">
                  <Button
                    variant="warning"
                    onClick={startRecording}
                  >
                    Re-Record
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card.Body>
        <Card.Footer>
          <div className="d-flex justify-content-center align-items-center">
            <Button
              variant="secondary"
              onClick={goPrev}
              disabled={currentIndex === 0}
            >
              Previous
            </Button>
            <span className="mx-3">
              {currentIndex + 1}/{data.length}
            </span>
            <Button
              variant="secondary"
              onClick={handleNext}
              disabled={currentIndex === data.length - 1}
            >
              Next
            </Button>
          </div>
        </Card.Footer>
      </Card>
    </div>
  );
}

export default PronunciationTaskBase; 