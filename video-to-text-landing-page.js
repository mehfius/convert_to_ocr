// video-to-text-landing-page.js

function showMessage(message) {
    const modal = document.getElementById('messageModal');
    const modalMessage = document.getElementById('modalMessage');
    modalMessage.textContent = message;
    modal.classList.remove('hidden');
}

function closeMessageModal() {
    const modal = document.getElementById('messageModal');
    modal.classList.add('hidden');
}

const { createFFmpeg, fetchFile } = FFmpeg;
let currentFfmpegInstance = null;
let isFfmpegRunning = false;
let lastExtractedAudioBlob = null;

const videoInput = document.getElementById('videoUpload');
const extractButton = document.getElementById('extractBtn');
const statusDisplay = document.getElementById('status');
const progressBar = document.getElementById('progressBar');
const fileNameDisplay = document.getElementById('fileName');
const loadingIndicator = document.getElementById('loadingIndicator');
const audioDownloadContainer = document.getElementById('audioDownloadContainer');
const audioDownloadLink = document.getElementById('audioDownloadLink');
const transcribeButton = document.getElementById('transcribeBtn');
const transcriptionLoadingIndicator = document.getElementById('transcriptionLoadingIndicator');
const transcriptionResultContainer = document.getElementById('transcriptionResultContainer');
const transcriptionSegmentsDiv = document.getElementById('transcriptionSegments');

function displayFileName(event) {
    if (event.target.files.length > 0) {
        fileNameDisplay.textContent = `Ficheiro selecionado: ${event.target.files[0].name}`;
    } else {
        fileNameDisplay.textContent = '';
    }
}

async function extractAudio() {
    if (isFfmpegRunning) {
        console.warn("FFmpeg já está a correr um comando. Por favor, aguarde.");
        return;
    }

    const file = videoInput.files[0];

    extractButton.disabled = true;
    isFfmpegRunning = true;

    statusDisplay.textContent = '';
    progressBar.style.width = '0%';
    progressBar.textContent = '0%';
    audioDownloadContainer.classList.add('hidden');
    loadingIndicator.classList.add('hidden');
    transcriptionResultContainer.classList.add('hidden');
    transcriptionSegmentsDiv.innerHTML = '';


    if (!file) {
        showMessage('Por favor, selecione um ficheiro de vídeo primeiro.');
        extractButton.disabled = false;
        isFfmpegRunning = false;
        return;
    }

    loadingIndicator.classList.remove('hidden');
    statusDisplay.textContent = 'Status: A carregar FFmpeg para extração...';

    try {
        currentFfmpegInstance = createFFmpeg({
            log: true,
            corePath: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js',
            wasmPath: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.wasm'
        });

        await currentFfmpegInstance.load();
        statusDisplay.textContent = 'Status: A ler ficheiro...';

        currentFfmpegInstance.FS('writeFile', 'input.mp4', await fetchFile(file));

        statusDisplay.textContent = 'Status: A extrair áudio...';

        currentFfmpegInstance.setProgress(({ ratio }) => {
            const percent = Math.round(ratio * 100);
            progressBar.textContent = `${percent}%`;
            progressBar.style.width = `${percent}%`;
        });

        await currentFfmpegInstance.run(
            '-i', 'input.mp4',
            '-ac', '1',
            '-ar', '16000',
            '-sample_fmt', 's16',
            'output.wav'
        );

        statusDisplay.textContent = 'Status: A gerar ficheiro de áudio...';
        const data = currentFfmpegInstance.FS('readFile', 'output.wav');

        const audioBlob = new Blob([data.buffer], { type: 'audio/wav' });
        lastExtractedAudioBlob = audioBlob;
        const audioUrl = URL.createObjectURL(audioBlob);

        audioDownloadLink.href = audioUrl;
        audioDownloadLink.download = 'audio-extraido.wav';
        audioDownloadLink.textContent = 'Descarregar Áudio (WAV)';
        audioDownloadContainer.classList.remove('hidden');

        statusDisplay.textContent = '✅ Áudio extraído com sucesso!';
        progressBar.textContent = '100%';
        progressBar.style.width = '100%';

    } catch (error) {
        console.error("Erro durante a extração de áudio:", error);
        showMessage('Ocorreu um erro durante a extração do áudio. Por favor, tente novamente.');
        statusDisplay.textContent = 'Status: Erro na extração.';
        progressBar.style.width = '0%';
        progressBar.textContent = '0%';
    } finally {
        loadingIndicator.classList.add('hidden');
        extractButton.disabled = false;
        isFfmpegRunning = false;

        if (currentFfmpegInstance) {
            currentFfmpegInstance.exit();
            currentFfmpegInstance = null;
        }
    }
}

async function transcribeAudio() {
    if (!lastExtractedAudioBlob) {
        showMessage('Nenhum áudio extraído para transcrever. Por favor, extraia o áudio primeiro.');
        return;
    }

    transcribeButton.disabled = true;
    transcriptionLoadingIndicator.classList.remove('hidden');
    transcriptionResultContainer.classList.add('hidden');
    transcriptionSegmentsDiv.innerHTML = '';
    statusDisplay.textContent = 'Status: A transcrever áudio...';

    try {
        const formData = new FormData();
        formData.append('file', lastExtractedAudioBlob, 'audio-extraido.wav');
        formData.append('model', 'ggml-base.bin'); // Adicionando o modelo conforme o cURL

        const apiUrl = 'https://reindeer-evident-primarily.ngrok-free.app/transcribe';

        const response = await fetch(apiUrl, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro na API de transcrição: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();

        if (result.transcription_segments && result.transcription_segments.length > 0) {
            transcriptionResultContainer.classList.remove('hidden');
            result.transcription_segments.forEach(segment => {
                const segmentDiv = document.createElement('div');
                segmentDiv.classList.add('bg-gray-100', 'border', 'border-gray-300', 'rounded-lg', 'p-3', 'mb-2', 'text-left');
                segmentDiv.innerHTML = `
                    <span class="font-semibold text-indigo-700 block mb-1">${segment.start} - ${segment.end}</span>
                    <p class="text-gray-800 leading-tight">${segment.text}</p>
                `;
                transcriptionSegmentsDiv.appendChild(segmentDiv);
            });
            statusDisplay.textContent = '✅ Transcrição gerada com sucesso!';
        } else {
            showMessage('A transcrição não retornou segmentos válidos.');
            statusDisplay.textContent = 'Status: Erro na transcrição.';
        }

    } catch (error) {
        console.error("Erro durante a transcrição de áudio:", error);
        showMessage(`Ocorreu um erro durante a transcrição do áudio: ${error.message}. Por favor, tente novamente.`);
        statusDisplay.textContent = 'Status: Erro na transcrição.';
    } finally {
        transcribeButton.disabled = false;
        transcriptionLoadingIndicator.classList.add('hidden');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    extractButton.disabled = false;
    statusDisplay.textContent = 'Status: Pronto para extrair.';
});

extractButton.addEventListener('click', extractAudio);
transcribeButton.addEventListener('click', transcribeAudio);

function copyToClipboard() {
    // Esta função não é usada no fluxo atual.
}