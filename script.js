// 必要なHTML要素を取得します
const imageInput = document.getElementById('image-input');
const textInputsContainer = document.getElementById('text-inputs');
const addTextBtn = document.getElementById('add-text-btn');
const bgmInput = document.getElementById('bgm-input');
const createVideoBtn = document.getElementById('create-video-btn');
const progressArea = document.getElementById('progress-area');
const progressText = document.getElementById('progress-text');
const progressBar = document.getElementById('progress-bar');

// FFmpeg.wasmのコアライブラリを読み込むための準備
const { createFFmpeg, fetchFile } = FFmpeg;
const ffmpeg = createFFmpeg({
    log: true, // 処理ログをコンソ-ルに表示する
    progress: ({ ratio }) => {
        // 進捗をプログレスバーに反映
        progressBar.value = ratio * 100;
        if (ratio === 1) {
            progressArea.style.display = 'none';
        }
    },
});

// テキスト入力欄を追加するボタンの処理
addTextBtn.addEventListener('click', () => {
    const textGroup = document.createElement('div');
    textGroup.className = 'text-group';
    const newIndex = textInputsContainer.children.length + 1;
    textGroup.innerHTML = `<input type="text" class="text-input" placeholder="テキスト${newIndex}">`;
    textInputsContainer.appendChild(textGroup);
});


// 「動画を作成する」ボタンが押されたときの処理
createVideoBtn.addEventListener('click', async () => {
    // ---- 入力チェック ----
    if (imageInput.files.length === 0) {
        alert('画像を1枚以上選択してください。');
        return;
    }
    
    // ---- 処理開始 ----
    progressText.textContent = '準備中...';
    progressArea.style.display = 'block';
    progressBar.value = 0;
    
    // FFmpegがロードされていなければロードする（初回のみ）
    if (!ffmpeg.isLoaded()) {
        progressText.textContent = 'エンジンをロード中...';
        await ffmpeg.load();
    }
    
    // ---- ファイルをFFmpegに渡す ----
    progressText.textContent = 'ファイルを読み込み中...';
    // 画像ファイルを読み込む
    for (let i = 0; i < imageInput.files.length; i++) {
        const file = imageInput.files[i];
        ffmpeg.FS('writeFile', `image${i}.png`, await fetchFile(file));
    }
    // BGMファイルを読み込む
    if (bgmInput.files.length > 0) {
        ffmpeg.FS('writeFile', 'bgm.mp3', await fetchFile(bgmInput.files[0]));
    }
    // フォントファイルを読み込む
    ffmpeg.FS('writeFile', '/fonts/NotoSansJP-Bold.ttf', await fetchFile('./fonts/NotoSansJP-Bold.ttf'));
    
    // ---- FFmpegのコマンドを作成 ----
    const imageCount = imageInput.files.length;
    const imageDuration = 3; // 1枚あたりの表示時間（秒）
    const totalDuration = imageCount * imageDuration;
    
    const command = [
        '-r', `1/${imageDuration}`,      // 1枚あたり3秒でフレームレートを設定
        '-i', 'image%d.png',           // 連番の画像を入力
    ];

    // BGMがある場合は追加
    if (bgmInput.files.length > 0) {
        command.push('-i', 'bgm.mp3');
    }

    // テキストを取得してフィルターコマンドを作成
    const textFilters = [];
    const textElements = document.querySelectorAll('.text-input');
    textElements.forEach((input, index) => {
        if (input.value.trim() !== '') {
            const text = input.value.trim().replace(/'/g, "''"); // シングルクォートをエスケープ
            const startTime = index * imageDuration;
            const endTime = startTime + imageDuration;
            // テキストを中央下部に表示するフィルター
            textFilters.push(
                `drawtext=fontfile='/fonts/NotoSansJP-Bold.ttf':text='${text}':fontsize=70:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=10:x=(w-text_w)/2:y=h-th-h*0.2:enable='between(t,${startTime},${endTime})'`
            );
        }
    });

    // フィルターを追加
    let filterComplex = `scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:-1:-1:color=black,setsar=1`;
    if (textFilters.length > 0) {
        filterComplex += `,${textFilters.join(',')}`;
    }
    command.push('-vf', filterComplex);

    // BGMがある場合の音声設定
    if (bgmInput.files.length > 0) {
        command.push('-c:a', 'aac', '-shortest'); // 音声コーデックと、映像が終わったら音声も終わる設定
    }
    
    command.push(
        '-c:v', 'libx264',             // ビデオのエンコード形式
        '-pix_fmt', 'yuv420p',         // 幅広い環境で再生できるカラー形式
        '-t', String(totalDuration),   // 動画の全長
        'output.mp4'                   // 出力ファイル名
    );

    // ---- FFmpeg実行 ----
    progressText.textContent = '動画を生成中... (この処理には数分かかる場合があります)';
    await ffmpeg.run(...command);
    
    // ---- 生成された動画をダウンロード ----
    progressText.textContent = '完了！ダウンロードの準備をしています...';
    const data = ffmpeg.FS('readFile', 'output.mp4');
    const url = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'created_video.mp4';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // 使い終わったURLを解放
    URL.revokeObjectURL(url);
    progressArea.style.display = 'none';
});