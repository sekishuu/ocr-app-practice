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
        videoElement.srcObject  = stream;
        videoElement.play();
        statusArea.textContent  = '準備完了です。読み取りたい書類を写してください。';
    } catch (err) {
        console.error("カメラエラー:", err);
        statusArea.textContent  = 'エラー: カメラを起動できませんでした。HTTPS環境か確認してください。';
    }
}

function applyGrayscale(canvas) {
    const ctx             = canvas.getContext('2d');
    
    // 【1. データの取得】
    // キャンバス上の「左上(0,0)」から「右下(width, height)」までの
    // 全ての画素データを「数字の列」として引っ張り出します。
    const imageData      = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data           = imageData.data; 

    // 【2. ループ処理】
    // ここがポイントです。「i += 4」になっています。
    // 数字4つで「1つの画素」なので、4歩ずつ進みながら処理します。
    for (let i = 0; i < data.length; i += 4) {

        // 【3. 色の取り出し】
        // 現在地(i)が赤、隣(i+1)が緑、その隣(i+2)が青です。
        const r          = data[i];     
        const g          = data[i + 1]; 
        const b          = data[i + 2]; 
        // data[i+3] は透明度なので、今回は無視します。
        
        // 【4. グレーの計算】
        // 3つの色を混ぜて、1つの「明るさの値(gray)」を作ります。
        // 単純な割り算ではなく、人間の目に自然に見える比率(NTSC係数)を掛けています。
        const gray       = 0.298912 * r + 0.586611 * g + 0.114478 * b;

        // 【5. 色の書き換え】
        // RGBの全ての箱に、計算した「gray」を代入します。
        // 光の三原色は、R=G=B になると「グレー（無彩色）」になる性質があります。
        data[i]          = gray; // 赤をグレー値に
        data[i + 1]      = gray; // 緑をグレー値に
        data[i + 2]      = gray; // 青をグレー値に
    }

    // 【6. データの反映】
    // 書き換えた数字の列を、キャンバスに戻して表示を更新します。
    ctx.putImageData(imageData, 0, 0);
}

// 二値化処理を行う関数
// threshold: しきい値（0〜255）。デフォルトは128（中間の明るさ）
function applyBinarization(canvas, threshold = 128) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // 全画素を走査
    for (let i = 0; i < data.length; i += 4) {
        // すでにグレースケール化済みなので、R, G, Bのどれを見ても同じ値です。
        // ここでは代表してR（data[i]）の値を使います。
        const gray = data[i];

        // 【判定ロジック】
        // しきい値より大きければ白(255)、そうでなければ黒(0)
        let val;
        if (gray >= threshold) {
            val = 255; // 白
        } else {
            val = 0;   // 黒
        }

        // 白か黒か決まった値をRGBすべてに代入
        data[i]     = val;
        data[i + 1] = val;
        data[i + 2] = val;
        // alpha（透明度）はそのまま
    }

    // 書き換えたデータをCanvasに戻す
    ctx.putImageData(imageData, 0, 0);
}

// 読み取るボタン処理
captureBtn.addEventListener('click', async () => {
    // 1. UI状態の更新（読み取りボタン無効化、クリアボタン有効化）
    captureBtn.disabled         = true;
    clearBtn.disabled           = false;
    
    statusArea.textContent      = '画像をキャプチャしました。文字認識を開始します...';
    resultArea.innerHTML        = ''; 

    // 2. Canvasのサイズをビデオに合わせる
    canvasElement.width         = videoElement.videoWidth;
    canvasElement.height        = videoElement.videoHeight;
    
    // 3. 映像を描画
    const context = canvasElement.getContext('2d');
    context.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);

    // グレースケール化を実行
    applyGrayscale(canvasElement);

    // 二値化（白黒）を実行
    // しきい値は「128」
    applyBinarization(canvasElement, 128);

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

        statusArea.textContent  = '認識が完了しました。';
        const p                 = document.createElement('p');
        p.innerText             = text;
        p.style.whiteSpace      = 'pre-wrap';
        resultArea.appendChild(p);
    } catch (error) {
        console.error(error);
        statusArea.textContent  = 'エラー: 文字認識に失敗しました。';
    }
});

// クリアボタン処理
clearBtn.addEventListener('click', () => {
    // 1. UI状態のリセット
    captureBtn.disabled         = false;
    clearBtn.disabled           = true;
    
    // 2. 表示のリセット（Canvasを隠してVideoを表示）
    videoElement.style.display  = 'block';
    canvasElement.style.display = 'none';

    // 3. テキストとステータスのクリア
    resultArea.innerHTML        = '';
    statusArea.textContent      = '準備完了です。読み取りたい書類を写してください。';
});

// 初期化
startCamera();