// HTMLの部品を取得
const videoElement  = document.getElementById('camera-view');
const canvasElement = document.getElementById('snapshot');      // HTMLに追加したCanvas
const captureBtn    = document.getElementById('capture-btn');
const clearBtn      = document.getElementById('clear-btn');
const statusArea    = document.getElementById('status-area');
const resultArea    = document.getElementById('result-area');
const cropGuide     = document.getElementById('crop-guide');    // 【追加】ガイド枠を取得
const isPortrait = window.innerWidth < window.innerHeight;      // スマホが縦持ち（画面の幅 < 高さ）なら、数値を逆にする

// カメラを起動する処理
async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'environment',
                // 【追加】解像度をなるべく高くリクエストして、文字をくっきりさせる
                // idealは可能な限りこの数値に近づけるという命令。カメラ性能が低ければ可能な最大値で出力。（エラーにはならない）
                width:  { ideal: isPortrait ? 1080 : 1920 },    // 縦なら幅を狭く
                height: { ideal: isPortrait ? 1920 : 1080 }     // 縦なら高さを長く
            } 
        });
        videoElement.srcObject  = stream;
        videoElement.play();
        statusArea.textContent  = '準備完了です。読み取りたい書類を写してください。';
    } catch (err) {
        console.error("カメラエラー:", err);
        statusArea.textContent  = 'エラー: カメラを起動できませんでした。HTTPS環境か確認してください。';
    }
}

// グレースケール化処理を行う関数
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

    // --- トリミング計算 ---

    // A. 画面上でのサイズと位置（座標）を取得
    const videoRect = videoElement.getBoundingClientRect(); // ビデオの見た目のサイズ
    const guideRect = cropGuide.getBoundingClientRect();    // 赤枠の見た目のサイズ

    // B. 倍率を計算（実際のカメラ解像度 ÷ 画面上の表示サイズ）
    // 例: カメラが1920pxで、画面表示が384pxなら、倍率は5倍
    const ratioX = videoElement.videoWidth / videoRect.width;
    const ratioY = videoElement.videoHeight / videoRect.height;

    // C. 切り抜く座標とサイズを計算（実際の解像度ベースに変換）
    // (枠の左座標 - ビデオの左座標) * 倍率 = カメラ画像内でのX座標
    const cropX = (guideRect.left - videoRect.left) * ratioX;
    const cropY = (guideRect.top - videoRect.top) * ratioY;
    const cropW = guideRect.width * ratioX;
    const cropH = guideRect.height * ratioY;

    // 2. Canvasのサイズを「ビデオ全体」ではなく「切り抜くサイズ」に合わせる
    canvasElement.width  = cropW;
    canvasElement.height = cropH;
    
    // 3. 映像を切り抜いて描画
    const context = canvasElement.getContext('2d');
    
    // drawImage(元画像, 元画像の開始X, 元画像の開始Y, 元画像の幅, 元画像の高さ, CanvasのX, CanvasのY, Canvasの幅, Canvasの高さ)
    // 9個の引数を使ってトリミングと貼り付けを行う
    context.drawImage(
        videoElement,
        cropX, cropY, cropW, cropH, // 切り抜き範囲
        0, 0, cropW, cropH          // 貼り付け範囲（0,0から全体に）
    );

    // グレースケール化を実行
    applyGrayscale(canvasElement);

    // 二値化（白黒）を実行
    // しきい値は「128」
    applyBinarization(canvasElement, 128);

    // 4. 表示の切り替え（Videoを隠してCanvasを表示）
    videoElement.style.display  = 'none';
    cropGuide.style.display     = 'none'; // 【追加】撮影後はガイド枠も消す
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
    cropGuide.style.display     = 'flex'; // 【追加】ガイド枠を再表示（flexで中央揃え維持）
    canvasElement.style.display = 'none';

    // 3. テキストとステータスのクリア
    resultArea.innerHTML        = '';
    statusArea.textContent      = '準備完了です。読み取りたい書類を写してください。';
});

// 初期化
startCamera();