// HTMLの部品を取得
const videoElement  = document.getElementById('camera-view');
const captureBtn    = document.getElementById('capture-btn');
const statusArea    = document.getElementById('status-area');
const resultArea    = document.getElementById('result-area');

// カメラを起動する処理
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' } // 外側カメラを優先
        });
        videoElement.srcObject = stream;
        statusArea.textContent = '準備完了です。読み取りたい書類を写してください。';
    } catch (err) {
        console.error("カメラエラー:", err);
        statusArea.textContent = 'エラー: カメラを起動できませんでした。ブラウザの許可設定を確認してください。';
    }
}

// ボタンがクリックされたらOCRを実行
captureBtn.addEventListener('click', async () => {
    statusArea.textContent = '画像をキャプチャしています...';
    resultArea.innerHTML = ''; // 前回の結果をクリア

    // 映像から1フレームを画像としてキャプチャする
    const canvas    = document.createElement('canvas');
    canvas.width    = videoElement.videoWidth;
    canvas.height   = videoElement.videoHeight;
    const context   = canvas.getContext('2d');
    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

    statusArea.textContent = '文字を認識しています...（初回は時間がかかります）';

    // tessera.jsを使って文字認識を実行
    const { data: { text } } = await Tesseract.recognize(
        canvas,
        'jpn', // 日本語を指定
        {
            logger: m => {
                console.log(m);
                if (m.status === 'recognizing text') {
                    statusArea.textContent = `文字を認識中... ${Math.floor(m.progress * 100)}%`;
                }
            }
        }
    );

    // 認識が完了したら結果を表示
    statusArea.textContent = '認識が完了しました。';
    resultArea.innerText = text;
});

// ページが読み込まれたらカメラを起動
startCamera();