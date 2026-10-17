import './style.css';

const colours = [
  { name: 'Pink', value: '#ed6eaa', ink: '#32122a' },
  { name: 'Orange', value: '#ff9b50', ink: '#48240c' },
  { name: 'Purple', value: '#a08aef', ink: '#24184d' },
  { name: 'Green', value: '#8bd495', ink: '#153d22' },
  { name: 'Light blue', value: '#8bd4f1', ink: '#14364a' },
  { name: 'Dark blue', value: '#335bca', ink: '#ffffff' },
];

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    const video = document.getElementById("camera");
    video.srcObject = stream;

  } catch (error) {
    console.error("Give camera now: ", error);
  }
}

startCamera();