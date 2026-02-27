// HTMLの部品を取得
const videoElement  = document.getElementById('camera-view');
const canvasElement = document.getElementById('snapshot');      // HTMLに追加したCanvas
const captureBtn    = document.getElementById('capture-btn');
const clearBtn      = document.getElementById('clear-btn');
const statusArea    = document.getElementById('status-area');
const resultArea    = document.getElementById('result-area');
const cropGuide     = document.getElementById('crop-guide');    // 【追加】ガイド枠を取得
const isPortrait    = window.innerWidth < window.innerHeight;   // スマホが縦持ち（画面の幅 < 高さ）なら、数値を逆にする

// OpenCVの読み込み状態管理フラグ
let isOpenCvReady = false;

// HTMLで指定した onload="onOpenCvReady();" から呼ばれる関数
function onOpenCvReady()
{
    console.log('OpenCV.js is ready');
    isOpenCvReady = true;
    statusArea.textContent = '準備完了です。読み取りたい書類を写してください。';
}

// カメラを起動する処理
async function startCamera()
{
    statusArea.textContent = 'システムを起動中...'; // 初期表示
    try
    {
        const stream = await navigator.mediaDevices.getUserMedia({
            video:
            {
                facingMode: 'environment',
                // 【追加】解像度をなるべく高くリクエストして、文字をくっきりさせる
                // idealは可能な限りこの数値に近づけるという命令。カメラ性能が低ければ可能な最大値で出力。（エラーにはならない）
                width:  { ideal: isPortrait ? 1080 : 1920 },    // 縦なら幅を狭く
                height: { ideal: isPortrait ? 1920 : 1080 }     // 縦なら高さを長く
            }
        });
        videoElement.srcObject  = stream;
        videoElement.play();
        // OpenCVの準備待ちかどうかでメッセージを変える
        if (isOpenCvReady)
        {
            statusArea.textContent  = '準備完了です。読み取りたい書類を写してください。';
        }
        else
            {
            statusArea.textContent  = '画像処理エンジン(OpenCV)を読み込んでいます...';
        }
    }
    catch (err)
    {
        console.error("カメラエラー:", err);
        statusArea.textContent  = 'エラー: カメラを起動できませんでした。HTTPS環境か確認してください。';
    }
}

// グレースケール化処理を行う関数
function applyGrayscale(canvas) {
    const ctx            = canvas.getContext('2d');

    // 【1. データの取得】
    // キャンバス上の「左上(0,0)」から「右下(width, height)」までの
    // 全ての画素データを「数字の列」として引っ張り出します。
    const imageData      = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data           = imageData.data;

    // 【2. ループ処理】
    // ここがポイントです。「i += 4」になっています。
    // 数字4つで「1つの画素」なので、4歩ずつ進みながら処理します。
    for (let i = 0; i < data.length; i += 4)
    {
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
function applyBinarization(canvas, threshold = 128)
{
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // 全画素を走査
    for (let i = 0; i < data.length; i += 4)
    {
        // すでにグレースケール化済みなので、R, G, Bのどれを見ても同じ値です。
        // ここでは代表してR（data[i]）の値を使います。
        const gray = data[i];

        // 【判定ロジック】
        // しきい値より大きければ白(255)、そうでなければ黒(0)
        let val;
        if (gray >= threshold)
        {
            val = 255; // 白
        }
        else
        {
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

function applyPerspectiveCorrection(canvas)
{
    // OpenCVの準備チェック
    if (!isOpenCvReady)
    {
        console.warn("OpenCVがまだ準備できていません。");
        return;
    }

    // 各処理に使う変数を宣言
    let src                 = null;     // 元の画像データ
    let gray                = null;     // グレースケール画像用
    let blurred             = null;     // ぼかし処理後の画像用
    let edges               = null;     // エッジ（線画）画像用

    let dst                 = null;     // 画面に表示する結果用（ここに赤枠を描く）
    let contours            = null;     // 見つかった輪郭のリスト
    let hierarchy           = null;     // 輪郭の階層情報（今回は使いませんが必須）
    let approx              = null;     // 輪郭を近似（カクカクに）した結果用

    let srcTri              = null;

    let dstTri              = null;     // ★ステップ②で作る「理想の四角形」
    let transformMatrix     = null;     // ★ステップ③で作る「変換行列（計算式）」
    let binary              = null;     // 適応的二値化の出力用

    try
    {
        src                 = cv.imread(canvas);    // 元のカラー画像
        dst                 = src.clone();          // 元画像をコピー
        gray                = new cv.Mat();         // グレースケール化後の画像
        blurred             = new cv.Mat();         // ぼかし処理後の画像
        edges               = new cv.Mat();         // 輪郭抽出処理後の画像
        contours            = new cv.MatVector();   // 見つかった全ての輪郭をリストで保存
        hierarchy           = new cv.Mat();         // 輪郭の親子関係（Aの中にBがある等）が入る箱

        // 1. グレースケール化
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

        // 2. ぼかし処理
        // 5×5の範囲内の色の平均値を計算して色を変更する
        let ksize           = new cv.Size(5, 5);
        cv.GaussianBlur(gray, blurred, ksize, 0, 0, cv.BORDER_DEFAULT);

        // 3. 輪郭検出
//      cv.Canny(blurred, edges, 60, 185); // 元の値
        cv.Canny(blurred, edges, 5, 20);

        // 4. 輪郭を構成する点群を抽出する
        cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

        // 5. 一番大きな四角形を探すループ処理
        let maxArea         = 0;                                     // これまでに見つかった最大の面積
        let maxContourIndex = -1;                                    // 最大の面積を持つ輪郭の番号

        const minArea       = canvas.width * canvas.height * 0.05;   // 画面全体に対する面積の割合（5%以下の小さなゴミは無視する設定）

        if (approx) approx.delete();
        approx              = new cv.Mat();

        for (let i = 0; i < contours.size(); ++i)       // contours.sizeは見つかった図形の数
        {
            let cnt         = contours.get(i);          // i番目の輪郭を取り出す
            let area        = cv.contourArea(cnt);      // その輪郭の面積を計算

            let tmpApprox   = new cv.Mat();                          // 計算用の一時的な変数を作成

            if (area > minArea)
            {
                let peri    = cv.arcLength(cnt, true);  // 輪郭の周囲の長さを計算

                cv.approxPolyDP(cnt, tmpApprox, 0.02 * peri, true); // 輪郭を単純化する(元の値)
//              cv.approxPolyDP(cnt, tmpApprox, 0.08 * peri, true); // 輪郭を単純化する

                if (tmpApprox.rows === 4) // 頂点の数が4つ（＝四角形）かどうか判定
                {
                    if (area > maxArea) // これまでで一番大きい四角形か判定
                    {
                        maxArea         = area;
                        maxContourIndex = i;

                        if (approx)
                        {
                            approx.delete();   // 古いapproxがあれば削除し、新しい一番を保存
                        }
                        approx = tmpApprox;    // 最大のものは残す
                    }
                    else
                    {
                        tmpApprox.delete();    // 最大でないものは削除
                    }
                }
                else
                {
                    tmpApprox.delete();  // 四角形でないものは削除
                }
            }
            cnt.delete();   // メモリ解放
        }
/*
        // 6. 見つかった結果を描画
        if (maxContourIndex !== -1 && approx)
        {
            let color   = new cv.Scalar(255, 0, 0, 255);    // 赤色を定義 (R=255, G=0, B=0, Alpha=255)
            let points  = new cv.MatVector();               // 描画用のリストを作成（polylines関数はリスト形式を要求するため）

            points.push_back(approx);

            // true: 線を閉じる（四角形にする）、4: 線の太さ
            cv.polylines(dst, points, true, color, 4);      // dst(元のカラー画像)の上に、赤い線を書き込む

            points.delete();                                // 処理後は不要なので削除
        }

        // cv.imshow(canvas, dst);     // 結果を表示
        */

        // 4つの頂点を整理して変換元の座標を作る
        if (maxContourIndex !== -1 && approx)
        {
            let points = [];

            // Open.CV用の配列 → JSの配列に変換
            for (let row = 0; row < 4; row++)
            {
                points.push(
                {
                    x: approx.data32S[row * 2],
                    y: approx.data32S[row * 2 + 1]
                });
            }

            let tl = points[0];     // 左上の座標
            let tr = points[0];     // 右上の座標
            let br = points[0];     // 右下の座標
            let bl = points[0];     // 左下の座標

            for (let i = 1; i < points.length; i++)
            {
                if ((points[i].x + points[i].y) < (tl.x + tl.y))    // 左上は x + y が最小
                {
                    tl = points[i];
                }

                if ((points[i].x - points[i].y) > (tr.x - tr.y))    // 右上は x - y が最大
                {
                    tr = points[i];
                }

                if ((points[i].x + points[i].y) > (br.x + br.y))    // 右下は x + y が最大
                {
                    br = points[i];
                }

                if ((points[i].x - points[i].y) < (bl.x - bl.y))    // 左下は x - y が最小
                {
                    bl = points[i];
                }
            }

            let orderedPoints = [tl, tr, br, bl];   // 結果を格納
            // JSの配列 → Open.CV用の配列に変換
            srcTri = cv.matFromArray(4, 1, cv.CV_32FC2,
                    [
                        orderedPoints[0].x, orderedPoints[0].y, // 左上
                        orderedPoints[1].x, orderedPoints[1].y, // 右上
                        orderedPoints[2].x, orderedPoints[2].y, // 右下
                        orderedPoints[3].x, orderedPoints[3].y  // 左下
                    ]);

            // 変換先の座標（理想の四角形）を作る
            dstTri = cv.matFromArray(4, 1, cv.CV_32FC2,
                    [
                        0, 0,                           // 左上
                        canvas.width, 0,                // 右上
                        canvas.width, canvas.height,    // 右下
                        0, canvas.height,               // 左下
                    ]);

            // ①、②の情報を使って画像補正する計算処理を行う
            transformMatrix = cv.getPerspectiveTransform(srcTri, dstTri);

            // 計算された結果を使って、元のカメラ画像を変形させる
            cv.warpPerspective(src, dst, transformMatrix, new cv.Size(canvas.width, canvas.height));

            // 変形後の画像(dst)をグレー画像(gray)に変換
            cv.cvtColor(dst, gray, cv.COLOR_RGBA2GRAY, 0);

            // 二値化処理後の出力先の変数
            binary = new cv.Mat();
            // グレー画像(gray)を元に適応的二値化を行い結果を新しい変数(binary)に出力
            cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 21, 10);

            // 画面には二値化された結果を反映
            cv.imshow(canvas, binary); //

            // cv.imshow(canvas, dst); // 補正後の画像を表示
        }
        else
        {
            cv.imshow(canvas, src); // 見つからない場合は元の画像を表示
        }
    }
    catch (err)
    {
        console.error("OpenCV処理エラー:", err);
    }
    finally
    {
        // メモリ解放
        if (src) src.delete();
        if (gray) gray.delete();
        if (blurred) blurred.delete();
        if (edges) edges.delete();
        if (dst) dst.delete();
        if (contours) contours.delete();
        if (hierarchy) hierarchy.delete();
        if (approx) approx.delete();
        if (srcTri) srcTri.delete();

        if (dstTri) dstTri.delete();
        if (transformMatrix) transformMatrix.delete();
        if (binary) binary.delete();
    }
}


// 読み取るボタン処理
captureBtn.addEventListener('click', async () => {
    // 準備チェック
    // if (!isOpenCvReady)
    // {
    //     alert("画像処理エンジンの読み込み中です。少々お待ちください。");
    //     return;
    // }

    // 1. UI状態の更新（読み取りボタン無効化、クリアボタン有効化）
    captureBtn.disabled         = true;
    clearBtn.disabled           = false;
    statusArea.textContent      = '画像をキャプチャしました。補正と文字認識を開始します...';
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

    // 3. 映像を切り抜いて描画（一次トリミング：固定枠）
    const context = canvasElement.getContext('2d');

    // drawImage(元画像, 元画像の開始X, 元画像の開始Y, 元画像の幅, 元画像の高さ, CanvasのX, CanvasのY, Canvasの幅, Canvasの高さ)
    // 9個の引数を使ってトリミングと貼り付けを行う
    context.drawImage(
        videoElement,
        cropX, cropY, cropW, cropH, // 切り抜き範囲
        0, 0, cropW, cropH          // 貼り付け範囲（0,0から全体に）
    );

    // OpenCVによる画像補正
    applyPerspectiveCorrection(canvasElement);

    // グレースケール化を実行
    // applyGrayscale(canvasElement);

    // 二値化（白黒）を実行
    // しきい値は「128」
    // applyBinarization(canvasElement, 128);

    // 4. 表示の切り替え（Videoを隠してCanvasを表示）
    videoElement.style.display  = 'none';
    cropGuide.style.display     = 'none'; // 【追加】撮影後はガイド枠も消す
    canvasElement.style.display = 'block';

    // 5. OCR実行
    try
    {
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
    }
    catch (error)
    {
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