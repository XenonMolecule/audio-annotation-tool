import { initializeApp } from 'firebase/app';
import { getStorage } from 'firebase/storage';

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBkljDiw_gyQ7o0xtMHpWtnC0RUqLNU7oU",
    authDomain: "hai-gcp-accents-dialects.firebaseapp.com",
    projectId: "hai-gcp-accents-dialects",
    storageBucket: "hai-gcp-accents-dialects.firebasestorage.app",
    messagingSenderId: "1041330391645",
    appId: "1:1041330391645:web:12f338b105a25646875bb4"
  };

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Get a reference to the storage service
export const storage = getStorage(app); 