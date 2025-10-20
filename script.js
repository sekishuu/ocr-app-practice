// HTMLの部品を取得
const videoElement  = document.getElementById('camera-view');
const statusArea    = document.getElementById('status-area');

// カメラを起動する処理
async function startCamera()
{
    try
    {
        const stream = await navigator.mediaDevices.getUserMedia
        (
            { video: { facingMode: 'environment' } } // 外側カメラを優先
        );
        videoElement.srcObject = stream;
        videoElement.play();
        statusArea.textContent = '準備完了です。読み取りたい書類を写してください。';
    }
    catch (err)
    {
        console.error("カメラエラー:", err);
        statusArea.textContent = 'エラー: カメラを起動できませんでした。ブラウザの許可設定を確認してください。';
    }
}

// ページが読み込まれたらカメラを起動
startCamera();