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
    corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js', // コアパスを明示的に指定
    log: true, // 処理ログをコンソールに表示する
    progress: ({ ratio }) => {
        // 進捗をプログレスバーに反映
        let progress = ratio * 100;
        if (progress < 0) progress = 0;
        if (progress > 100) progress = 100;
        progressBar.value = progress;
        if (ratio >= 1) {
            // 完了後少し待ってから非表示に
            setTimeout(() => {
                 progressArea.style.display = 'none';
            }, 500);
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
    createVideoBtn.disabled = true; // ボタンを無効化
    progressText.textContent = '準備中...';
    progressArea.style.display = 'block';
    progressBar.value = 0;
    
    if (!ffmpeg.isLoaded()) {
        progressText.textContent = 'エンジンをロード中...';
        await ffmpeg.load();
    }
    
    // ---- ファイルをFFmpegに渡す ----
    progressText.textContent = 'ファイルを読み込み中...';
    const imageFiles = [];
    for (let i = 0; i < imageInput.files.length; i++) {
        const file = imageInput.files[i];
        const fileName = `image${i}.png`;
        ffmpeg.FS('writeFile', fileName, await fetchFile(file));
        imageFiles.push(fileName);
    }
    if (bgmInput.files.length > 0) {
        ffmpeg.FS('writeFile', 'bgm.mp3', await fetchFile(bgmInput.files[0]));
    }
    ffmpeg.FS('writeFile', '/fonts/NotoSansJP-Bold.ttf', await fetchFile('./fonts/NotoSansJP-Bold.ttf'));

    const selectedTemplate = document.querySelector('input[name="template"]:checked').value;
    if (selectedTemplate === 'polaroid') {
         ffmpeg.FS('writeFile', 'template1.png', await fetchFile('./template1.png'));
    }

    // ---- FFmpegのコマンドを作成 ----
    const imageCount = imageFiles.length;
    const imageDuration = 3; // 1枚あたりの表示時間
    const fadeDuration = 0.5; // トランジションの時間
    const totalDuration = imageCount * imageDuration;

    const command = [];
    // 入力ファイル
    imageFiles.forEach(file => command.push('-i', file));
    if (bgmInput.files.length > 0) command.push('-i', 'bgm.mp3');
    if (selectedTemplate === 'polaroid') command.push('-i', 'template1.png');

    // フィルター設定
    let filterComplex = '';

    // 1. 各画像をリサイズして9:16の黒背景に配置
    for(let i = 0; i < imageCount; i++) {
        filterComplex += `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:-1:-1:color=black,setsar=1[v${i}];`;
    }

    // 2. トランジション（フェード）を適用
    let lastStream = `v0`;
    for(let i = 0; i < imageCount - 1; i++) {
        const nextStream = `v${i+1}`;
        const outputStream = `vt${i}`;
        const offset = (i + 1) * imageDuration - fadeDuration;
        filterComplex += `[${lastStream}][${nextStream}]xfade=transition=fade:duration=${fadeDuration}:offset=${offset}[${outputStream}];`;
        lastStream = outputStream;
    }

    // 3. テキストを追加
    const textElements = document.querySelectorAll('.text-input');
    textElements.forEach((input, index) => {
        if (input.value.trim() !== '' && index < imageCount) {
            const text = input.value.trim().replace(/'/g, "''");
            const startTime = index * imageDuration;
            const endTime = startTime + imageDuration;
            filterComplex += `[${lastStream}]drawtext=fontfile='/fonts/NotoSansJP-Bold.ttf':text='${text}':fontsize=70:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=10:x=(w-text_w)/2:y=h-th-h*0.2:enable='between(t,${startTime},${endTime})'[${lastStream}];`;
        }
    });

    // 4. テンプレートを合成
    if (selectedTemplate === 'polaroid') {
        filterComplex += `[${lastStream}][${imageCount}]overlay[final_v]`;
    } else {
        filterComplex += `[${lastStream}]null[final_v]`;
    }

    command.push('-filter_complex', filterComplex);
    command.push('-map', '[final_v]');
    if (bgmInput.files.length > 0) {
        command.push('-map', `${imageCount}:a?`, '-c:a', 'aac', '-shortest');
    }
    
    command.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-t', String(totalDuration), 'output.mp4');

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

    URL.revokeObjectURL(url);
    createVideoBtn.disabled = false; // ボタンを有効化
});
