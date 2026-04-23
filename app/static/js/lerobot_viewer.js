/* LeRobot dataset viewer */

const video = document.getElementById('episode-video');
const playBtn = document.getElementById('play-btn');
const frameInfo = document.getElementById('frame-info');
const progressFill = document.getElementById('progress-bar-fill');

let currentEpisodeData = null;
let datasetFps = 10;

// ── Init ──────────────────────────────────────────────────────────────────────

document.getElementById('dir-display').textContent = LEROBOT_DIR;
loadEpisodeList();

// ── Episode list ──────────────────────────────────────────────────────────────

async function loadEpisodeList() {
    try {
        const resp = await fetchWithTimeout(`/api/lerobot/episodes?dir=${dirParam}`);
        const data = await resp.json();
        if (!data.success) throw new Error(data.error);

        datasetFps = data.fps || 10;
        document.getElementById('info-fps').textContent = datasetFps;
        document.getElementById('episode-count').textContent = data.total_episodes;

        const list = document.getElementById('episode-list');
        list.innerHTML = '';
        data.episodes.forEach(ep => {
            const idx = ep.episode_index;
            const frames = ep.length != null ? ep.length : '?';
            const item = document.createElement('div');
            item.className = 'ep-item';
            item.dataset.idx = idx;
            item.innerHTML = `<span class="ep-item-id">Ep ${String(idx).padStart(2, '0')}</span><span class="ep-item-frames">${frames}f</span>`;
            item.onclick = () => selectEpisode(idx, item);
            list.appendChild(item);
        });

        // Auto-select first episode
        if (data.episodes.length > 0) {
            const first = list.querySelector('.ep-item');
            if (first) first.click();
        }
    } catch (e) {
        document.getElementById('episode-list').innerHTML =
            `<div class="empty-state" style="color:#e53e3e;">加载失败: ${e.message}</div>`;
    }
}

// ── Episode detail ────────────────────────────────────────────────────────────

async function selectEpisode(idx, itemEl) {
    // Mark active
    document.querySelectorAll('.ep-item').forEach(el => el.classList.remove('active'));
    itemEl.classList.add('active');

    // Reset UI
    setChartLoading();
    document.getElementById('info-frames').textContent = '-';
    document.getElementById('info-duration').textContent = '-';
    document.getElementById('info-ep').textContent = idx;
    frameInfo.textContent = '帧 0 / 0';
    progressFill.style.width = '0%';

    try {
        const resp = await fetchWithTimeout(`/api/lerobot/episode/${idx}?dir=${dirParam}`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (!data.success) throw new Error(data.error);

        currentEpisodeData = data;
        const fps = data.fps || datasetFps;
        const nFrames = data.timestamps ? data.timestamps.length : 0;

        document.getElementById('info-frames').textContent = nFrames;
        document.getElementById('info-fps').textContent = fps;
        document.getElementById('info-duration').textContent = nFrames ? (nFrames / fps).toFixed(1) : '-';
        frameInfo.textContent = `帧 0 / ${nFrames}`;

        // Video
        if (data.video_url) {
            video.src = data.video_url;
            video.load();
        } else {
            video.src = '';
        }

        // Chart
        renderChart(data);

    } catch (e) {
        document.getElementById('force-chart').innerHTML =
            `<div class="empty-state" style="color:#e53e3e; padding: 16px;">加载失败: ${e.message}</div>`;
    }
}

// ── Chart ─────────────────────────────────────────────────────────────────────

function setChartLoading() {
    const el = document.getElementById('force-chart');
    el.innerHTML = '<div class="loading-state">加载中...</div>';
}

function renderChart(data) {
    const ts = data.timestamps || [];
    const fl = data.force_left || [];
    const fr = data.force_right || [];
    const tid = data.thumb_index_dist || [];

    const traces = [];
    if (fl.length) traces.push({ x: ts, y: fl, name: '左手力度', type: 'scatter', line: { color: '#667eea', width: 2 } });
    if (fr.length) traces.push({ x: ts, y: fr, name: '右手力度', type: 'scatter', line: { color: '#ed8936', width: 2 } });
    if (tid.length) traces.push({ x: ts, y: tid, name: '拇食指距离', type: 'scatter', line: { color: '#48bb78', width: 1.5, dash: 'dot' }, yaxis: 'y2' });

    const chartEl = document.getElementById('force-chart');
    const h = Math.max(chartEl.clientHeight || 0, 220);

    const layout = {
        height: h,
        margin: { t: 10, r: 60, b: 40, l: 50 },
        legend: { orientation: 'h', y: -0.15 },
        xaxis: { title: '时间 (s)', showgrid: true, gridcolor: '#f0f0f0' },
        yaxis: { title: '力度 (N)', showgrid: true, gridcolor: '#f0f0f0' },
        yaxis2: { title: '距离 (m)', overlaying: 'y', side: 'right', showgrid: false },
        paper_bgcolor: 'white',
        plot_bgcolor: 'white',
        shapes: [],
    };

    Plotly.newPlot(chartEl, traces, layout, { responsive: true, displayModeBar: false });
}

let markerTimeout = null;
function updateChartMarker() {
    if (!currentEpisodeData) return;
    const t = video.currentTime;
    const fps = currentEpisodeData.fps || datasetFps;
    const nFrames = currentEpisodeData.timestamps ? currentEpisodeData.timestamps.length : 0;

    const frame = Math.min(Math.round(t * fps), nFrames);
    frameInfo.textContent = `帧 ${frame} / ${nFrames}`;
    if (nFrames > 0) progressFill.style.width = `${Math.min(100, (frame / nFrames) * 100).toFixed(1)}%`;

    // Throttle Plotly relayout to avoid jank
    if (markerTimeout) return;
    markerTimeout = setTimeout(() => {
        markerTimeout = null;
        try {
            Plotly.relayout('force-chart', {
                shapes: [{
                    type: 'line', x0: t, x1: t, y0: 0, y1: 1,
                    xref: 'x', yref: 'paper',
                    line: { color: '#e53e3e', width: 1.5, dash: 'dot' },
                }],
            });
        } catch (_) {}
    }, 100);
}

// ── Fetch with timeout ────────────────────────────────────────────────────────

function fetchWithTimeout(url, ms = 15000) {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(tid));
}

// ── Video controls ────────────────────────────────────────────────────────────

function togglePlay() {
    if (video.paused) {
        video.play();
        playBtn.textContent = '⏸ 暂停';
    } else {
        video.pause();
        playBtn.textContent = '▶ 播放';
    }
}

function stopVideo() {
    video.pause();
    video.currentTime = 0;
    playBtn.textContent = '▶ 播放';
}

function changeSpeed() {
    video.playbackRate = parseFloat(document.getElementById('speed-select').value);
}

function seekByClick(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    if (video.duration) video.currentTime = ratio * video.duration;
}

video.addEventListener('ended', () => { playBtn.textContent = '▶ 播放'; });
video.addEventListener('timeupdate', updateChartMarker);
// Show first frame once metadata is available
video.addEventListener('loadedmetadata', () => { video.currentTime = 0.001; });
