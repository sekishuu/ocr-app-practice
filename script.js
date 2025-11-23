// HTMLの部品を取得
const videoElement  = document.getElementById('camera-view');
const canvasElement = document.getElementById('snapshot'); // HTMLに追加したCanvas
const captureBtn    = document.getElementById('capture-btn');
const clearBtn      = document.getElementById('clear-btn');
const statusArea    = document.getElementById('status-area');
const resultArea    = document.getElementById('result-area');

// カメラを起動する処理
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' } 
        });
        videoElement.srcObject = stream;
        videoElement.play();
        statusArea.textContent = '準備完了です。読み取りたい書類を写してください。';
    } catch (err) {
        console.error("カメラエラー:", err);
        statusArea.textContent = 'エラー: カメラを起動できませんでした。HTTPS環境か確認してください。';
    }
}

// 読み取るボタン処理
captureBtn.addEventListener('click', async () => {
    // 1. UI状態の更新（読み取りボタン無効化、クリアボタン有効化）
    captureBtn.disabled = true;
    clearBtn.disabled   = false;
    
    statusArea.textContent = '画像をキャプチャしました。文字認識を開始します...';
    resultArea.innerHTML   = ''; 

    // 2. Canvasのサイズをビデオに合わせる
    canvasElement.width  = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    
    // 3. 映像を描画
    const context = canvasElement.getContext('2d');
    context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

    // 4. 表示の切り替え（Videoを隠してCanvasを表示）
    videoElement.style.display  = 'none';
    canvasElement.style.display = 'block';

    // 5. OCR実行
    try {
        const { data: { text } } = await Tesseract.recognize(
            canvasElement,
            'jpn',
            {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        statusArea.textContent = `文字を認識中... ${Math.floor(m.progress * 100)}%`;
                    }
                }
            }
        );

        statusArea.textContent = '認識が完了しました。';
        const p = document.createElement('p');
        p.innerText = text;
        p.style.whiteSpace = 'pre-wrap';
        resultArea.appendChild(p);
    } catch (error) {
        console.error(error);
        statusArea.textContent = 'エラー: 文字認識に失敗しました。';
    }
});

// クリアボタン処理
clearBtn.addEventListener('click', () => {
    // 1. UI状態のリセット
    captureBtn.disabled = false;
    clearBtn.disabled   = true;
    
    // 2. 表示のリセット（Canvasを隠してVideoを表示）
    videoElement.style.display  = 'block';
    canvasElement.style.display = 'none';

    // 3. テキストとステータスのクリア
    resultArea.innerHTML   = '';
    statusArea.textContent = '準備完了です。読み取りたい書類を写してください。';
});

// 初期化
startCamera();