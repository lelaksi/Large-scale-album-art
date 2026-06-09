// @ts-check
// Name: Large-scale album art
// Author: lelaksi
// Description: Giving album art the love it deserves.

(function AlbumArtCentralView() {
	if (!Spicetify.Player || !Spicetify.Topbar || !Spicetify.Platform || !Spicetify.Platform.History) {
		setTimeout(AlbumArtCentralView, 300);
		return;
	}
	// Token-free Data Sources Config
	const DEFAULT_SOURCES = {
		SPOTIFY_INTERNAL_GRAPHQL: true,
		DEEZER_API: true,
		APPLE_MUSIC_WEB: true,
		MUSICBRAINZ_WIKIDATA: false,
		ALLMUSIC: true
	};

	const DEFAULT_COVER_SOURCES = {
		SPOTIFY_XL: true,
		ITUNES_COVER: true,
		DEEZER_COVER: true
	};

	const DEFAULT_TRACK_SOURCES = {
		SPOTIFY_TRACKS: true,
		DEEZER_TRACKS: true,
		MUSICBRAINZ_TRACKS: true
	};

	let sourceSettings = JSON.parse(localStorage.getItem('central-art-sources') || JSON.stringify(DEFAULT_SOURCES));
	let coverSourceSettings = JSON.parse(localStorage.getItem('central-art-cover-sources') || JSON.stringify(DEFAULT_COVER_SOURCES));
	let trackSourceSettings = JSON.parse(localStorage.getItem('central-art-track-sources') || JSON.stringify(DEFAULT_TRACK_SOURCES));

	let debugMode = localStorage.getItem('central-art-debug') === 'true';
	let damageMode = localStorage.getItem('central-art-damage') !== 'false';
	let glossMode = localStorage.getItem('central-art-gloss') !== 'false';
	let plasticMode = localStorage.getItem('central-art-plastic') !== 'false';

	let debugState = {};
	let coverDebugState = {};
	let trackDebugState = {};

	let isViewActive = localStorage.getItem('central-art-active') === 'true';
	let overlay = null;
	let imgWrapper = null;
	let flipInner = null;
	let flipBack = null;
	let mainImg = null;
	let bgBlur = null;

	// Text elements
	let titleEl = null;
	let artistEl = null;
	let backTitleEl = null;
	let backAlbumEl = null;
	let backArtistEl = null;
	let backFormatEl = null;
	let backTracklistEl = null;
	let statusIndicator = null;

	// Debug panels
	let debugPanel = null;
	let debugToggleBtn = null;

	let urlChain = [];
	let chainIndex = 0;
	let currentTrackUri = '';

	// Physics & Interaction State
	let isFlipped = false;
	let isHovered = false;
	let isAnimatingFlip = false;
	let flipTimeout = null;
	let lastPercentX = 0;
	let lastPercentY = 0;
	let zoomScale = 1.0;
	const MIN_ZOOM = 1.0;
	const MAX_ZOOM = 3.9;

	// Inject responsive stylesheet rules
	const styleSheet = document.createElement("style");
	styleSheet.innerText = `
    .Root__main-view {
        position: relative;
    }
    body.central-art-active .main-view-container {
        display: none !important;
    }
    #album-art-overlay {
        position: absolute;
        top: 0; left: 0; width: 100%; height: 100%;
        z-index: 99;
        display: flex;
        align-items: center; justify-content: center;
        overflow: hidden;
        background-color: #121212;
    }
    #album-art-overlay-blur {
        position: absolute;
        top: -40px; left: -40px;
        width: calc(100% + 80px); height: calc(100% + 80px);
        background-size: cover; background-position: center;
        filter: blur(50px) brightness(0.35);
        z-index: 1;
        transition: opacity 0.6s ease-in-out, background-image 0.6s ease-in-out;
    }
    #album-art-overlay-container {
        position: relative; z-index: 2;
        display: flex; flex-direction: column;
        align-items: center; justify-content: center;
        width: 100%; height: 100%;
        padding: 3vh 24px; box-sizing: border-box;
        pointer-events: none;
        perspective: 1100px;
        gap: 2.5vh;
    }
    #album-art-img-wrapper {
        width: 64vh; max-width: 80vw;
        aspect-ratio: 1 / 1; height: auto;
        flex-shrink: 0;
        pointer-events: auto;
        cursor: pointer;
        perspective: 950px;
        position: relative;
    }
    
    /* Ultra-HD Resolution Canvas Mapping (300% Size scaled down to 33% + physical solid 3D depth card background) */
    #album-art-flip-inner {
        position: absolute;
        width: 300%; height: 300%;
        top: -100%; left: -100%;
        transform-style: preserve-3d;
        will-change: transform, box-shadow;
        background-color: #0c0c0d;
        box-shadow: 
            0 4px 0 #181818,
            0 8px 0 #121212,
            0 60px 180px rgba(0, 0, 0, 0.85);
        border-radius: 24px;
        transform: translate3d(0%, 0%, 1.001px) rotateX(0deg) rotateY(0deg) scale3d(0.33333, 0.33333, 0.33333);
    }
    .album-art-face {
        position: absolute;
        width: 100%; height: 100%;
        backface-visibility: hidden;
        border-radius: 24px;
        overflow: hidden;
        background-color: #181818;
    }
    /* physical cardboard 3D gap translations */
    #album-art-face-front {
        transform: translateZ(5px);
    }
    #album-art-face-back {
        transform: rotateY(180deg) translateZ(5px);
    }
    #album-art-face-front img {
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        object-fit: cover;
        image-rendering: auto;
        pointer-events: none;
        transition: opacity 0.4s ease;
    }
    
    /* Realism Vinyl Textures Layers */
    .album-art-texture {
        position: absolute;
        top: 0; left: 0; width: 100%; height: 100%;
        pointer-events: none;
        z-index: 10;
        border-radius: 24px;
    }
    .album-art-damage {
        background-image: url('https://img.magnific.com/free-photo/grunge-background-with-scratches-stains_1048-18582.jpg');
        background-size: cover;
        background-position: center;
        mix-blend-mode: multiply;
        opacity: 0.25; /* Subtle physical damage */
    }
    .album-art-env {
        background-image: url('https://img.magnific.com/premium-photo/woman-uses-laptop-home_1377152-1944.jpg');
        mix-blend-mode: screen;
        opacity: 0; /* Base 0, controlled heavily by JS hover state */
        filter: blur(25px) contrast(1.2); 
        /* Locks 120% height to square container forcing vertical slack, and scales width purely on native aspect ratio */
        background-size: auto 120%; 
        background-position: 50% 50%;
        will-change: background-position, opacity;
    }
    .album-art-plastic {
        background-image: url('https://img.magnific.com/fotos-premium/sobreposicao-de-plastico-transparente-realista-sobre-um-fundo-preto_435219-1884.jpg?semt=ais_hybrid&w=740&q=80');
        mix-blend-mode: screen;
        opacity: 0; /* Base 0, controlled by JS hover state */
        background-size: cover;
        background-position: center;
        z-index: 11;
        transform: scale(1.05);
        /* 400% Mask. Mathematics in applyTransform ensures edges never breach */
        -webkit-mask-image: linear-gradient(110deg, 
            transparent 35%, 
            rgba(0, 0, 0, 0.1) 45%, 
            rgba(0, 0, 0, 0.6) 49%, 
            rgba(0, 0, 0, 1.0) 50%, 
            rgba(0, 0, 0, 0.6) 51%, 
            rgba(0, 0, 0, 0.1) 55%, 
            transparent 65%);
        -webkit-mask-size: 400% 400%;
        -webkit-mask-repeat: no-repeat;
        -webkit-mask-position: 50% 50%;
        will-change: -webkit-mask-position, opacity;
    }

    #album-art-face-back-overlay {
        position: absolute;
        top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(10, 10, 10, 0.85);
        display: flex; flex-direction: column;
        justify-content: flex-start; align-items: flex-start;
        padding: 72px; box-sizing: border-box;
        text-align: left;
        overflow-y: auto;
        transition: opacity 0.3s ease;
        z-index: 1; /* Retain stack priority above artist image layers */
    }
    .album-art-face * {
        text-rendering: optimizeLegibility;
        -webkit-font-smoothing: antialiased;
        backface-visibility: hidden;
        transform: translate3d(0, 0, 0);
    }
    
    /* scaled canvas typography dimensions (increased sizes for maximum legibility) */
    .back-label {
        font-size: 5.0vh; font-weight: bold;
        text-transform: uppercase; letter-spacing: 6px;
        color: #b3b3b3; margin-bottom: 6px;
    }
    #album-art-back-title {
        font-size: 10.5vh; font-weight: 800; color: #fff;
        margin: 0 0 18px 0; line-height: 1.2;
        display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;
    }
    #album-art-back-artist {
        font-size: 7.2vh; font-weight: 600; color: #1db954;
        margin: 0 0 18px 0;
    }
    .back-value-text {
        font-size: 6.0vh; font-weight: 500; color: #e5e5e5;
        margin: 0 0 24px 0;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        max-width: 100%;
    }
    
    /* Dedicated smooth fade classes for asynchronous data loads */
    #album-art-back-label-format, #album-art-back-format, 
    #album-art-back-label-tracklist, #album-art-back-tracklist {
        opacity: 0;
        transition: opacity 0.4s ease;
    }
    
    /* Clickable link interactions on back metadata */
    .back-value-text.clickable-link {
        cursor: pointer;
        pointer-events: auto;
        transition: color 0.2s ease;
    }
    .back-value-text.clickable-link:hover {
        color: #1db954 !important;
        text-decoration: underline;
    }
    
    /* Balanced Multi-Column Tracklist (No Border Separators) */
    #album-art-back-tracklist {
        width: 100%;
        display: flex;
        flex-direction: row;
        justify-content: flex-start;
        align-items: flex-start;
        gap: 60px;
        margin-top: 15px;
        pointer-events: auto;
    }
    .tracklist-column {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
    }
    .tracklist-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 5.2vh;
        padding: 15px 0;
        color: #a7a7a7;
    }
    .tracklist-item.active {
        color: #1db954;
        font-weight: bold;
    }
    .tracklist-name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .tracklist-name.cols-1 { max-width: 96vw; }
    .tracklist-name.cols-2 { max-width: 45vw; }
    .tracklist-name.cols-3 { max-width: 30vw; }

    .tracklist-number {
        margin-right: 24px;
        color: #7f7f7f;
        width: 48px;
        flex-shrink: 0;
    }
    .tracklist-duration {
        color: #7f7f7f;
        font-size: 4.6vh;
        margin-left: 24px;
    }
    .tracklist-item.active .tracklist-number,
    .tracklist-item.active .tracklist-duration {
        color: #1db954;
    }
    
    #album-art-debug-panel {
        width: 100%;
        background: rgba(0, 0, 0, 0.45);
        border-radius: 6px;
        padding: 14px;
        box-sizing: border-box;
        border: 1px solid rgba(255, 255, 255, 0.1);
        margin-top: auto;
        margin-bottom: 24px;
        pointer-events: auto;
    }
    #album-art-debug-panel div {
        font-size: 13px !important;
        margin-bottom: 4px !important;
    }
    
    /* Sleeve Fineprint Footer Container (Seamless single line) */
    #album-art-back-fineprint {
        width: 100%;
        margin-top: auto;
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: center;
        gap: 15px;
        font-size: 2.6vh;
        color: #535353;
        pointer-events: auto;
        text-align: center;
        border-top: none !important;
    }
    
    .fineprint-btn {
        cursor: pointer;
        transition: color 0.2s, text-decoration 0.2s;
    }
    .fineprint-btn:hover {
        color: #e5e5e5 !important;
    }
    
    #album-art-overlay-meta {
        text-align: center; color: #ffffff;
        font-family: var(--font-family, sans-serif);
        max-width: 90%; flex-shrink: 0;
        transition: opacity 0.3s ease;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 15px;
        gap: 8px;
    }
    #album-art-overlay-title {
        font-weight: 700;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        max-width: 50vw;
        pointer-events: none;
    }
    #album-art-overlay-divider {
        color: #7f7f7f;
        user-select: none;
    }
    #album-art-overlay-artist {
        color: #b3b3b3;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        max-width: 30vw;
        pointer-events: auto; cursor: pointer;
        transition: color 0.2s ease;
    }
    #album-art-overlay-artist:hover {
        color: #ffffff; text-decoration: underline;
    }
    
    #album-art-toggle-btn {
        position: relative;
    }
    #album-art-toggle-btn.ControlButton--active::after,
    #album-art-toggle-btn.main-nowPlayingBar-button--active::after {
        content: '';
        position: absolute;
        bottom: 0px;
        left: 50%;
        transform: translateX(-50%);
        width: 4px;
        height: 4px;
        background-color: var(--spice-button-active, #1db954);
        border-radius: 50%;
    }
    #album-art-toggle-btn.ControlButton--active,
    #album-art-toggle-btn.main-nowPlayingBar-button--active {
        color: var(--spice-button-active, #1db954) !important;
    }
`;
	document.head.appendChild(styleSheet);

	function convertSpotifyUriRaw(url) {
		if (!url) return '';
		if (url.startsWith('spotify:image:')) {
			const hash = url.replace('spotify:image:', '');
			return `https://i.scdn.co/image/${hash}`;
		}
		return url;
	}

	function forceSizeIdentifier(url, targetSize) {
		if (!url) return '';
		const match = url.match(/ab67616d([0-9a-f]{8})/);
		if (match) {
			return url.replace(`ab67616d${match[1]}`, `ab67616d${targetSize}`);
		}
		return url;
	}

	function resolveUrl(strategy, item) {
		if (!item) return '';
		const meta = item.metadata;

		switch (strategy) {
			case 'METADATA_XLARGE':
				return meta?.image_xlarge_url ? convertSpotifyUriRaw(meta.image_xlarge_url) : '';
			case 'FORCE_B273': {
				const base = item.album?.images?.[0]?.url || meta?.image_url || '';
				return forceSizeIdentifier(convertSpotifyUriRaw(base), '0000b273');
			}
			case 'ALBUM_IMAGES_0':
				return item.album?.images?.[0]?.url || '';
			case 'METADATA_STANDARD':
				return meta?.image_url ? convertSpotifyUriRaw(meta.image_url) : '';
			default:
				return '';
		}
	}

	function isArtistMatch(spotifyArtist, candidateArtist) {
		if (!spotifyArtist || !candidateArtist) return false;
		const normSpotify = spotifyArtist.toLowerCase().replace(/[^a-z0-9]/g, '');
		const normCandidate = candidateArtist.toLowerCase().replace(/[^a-z0-9]/g, '');
		return normSpotify.includes(normCandidate) || normCandidate.includes(normSpotify);
	}

	function isAlbumMatch(spotifyAlbum, candidateAlbum) {
		if (!spotifyAlbum || !candidateAlbum) return false;
		const normSpotify = spotifyAlbum.toLowerCase().replace(/[^a-z0-9]/g, '');
		const normCandidate = candidateAlbum.toLowerCase().replace(/[^a-z0-9]/g, '');
		return normSpotify.includes(normCandidate) || normCandidate.includes(normSpotify);
	}

	async function requestExternalUrl(url, asText = false) {
		if (Spicetify.CosmosAsync && typeof Spicetify.CosmosAsync.get === 'function') {
			try {
				const res = await Spicetify.CosmosAsync.get(url);
				if (asText) {
					return typeof res === 'string' ? res : JSON.stringify(res);
				}
				return typeof res === 'string' ? JSON.parse(res) : res;
			} catch (e) {
				console.warn(`CosmosAsync bypass failed for ${url}, trying fallback native fetch...`, e);
			}
		}

		const response = await fetch(url);
		if (!response.ok) throw new Error(`HTTP ${response.status}`);
		return asText ? await response.text() : await response.json();
	}

	async function fetchAlbumMetadata(albumId) {
		try {
			const token = (await Spicetify.Platform?.AuthorizationAPI?.getAccessToken()) || Spicetify.Platform?.Session?.accessToken;
			if (token) {
				const res = await fetch(`https://api.spotify.com/v1/albums/${albumId}`, {
					headers: { 'Authorization': `Bearer ${token}` }
				});
				if (res.ok) {
					return await res.json();
				}
			}
		} catch (e) {
			console.warn('Spicetify Album Art Addon: Could not query album metadata object', e);
		}
		return null;
	}

	function updateDebugUI() {
		if (!debugPanel) return;
		debugPanel.style.display = debugMode ? 'block' : 'none';
		if (!debugMode) return;

		debugPanel.innerHTML = '';

		const coverTitle = document.createElement('div');
		coverTitle.style.fontWeight = 'bold';
		coverTitle.style.marginBottom = '6px';
		coverTitle.style.fontSize = '11px';
		coverTitle.style.color = '#fff';
		coverTitle.innerText = 'Cover Art Sources (Click to Toggle):';
		debugPanel.appendChild(coverTitle);

		Object.keys(DEFAULT_COVER_SOURCES).forEach(key => {
			const state = coverDebugState[key] || { status: 'Idle', detail: '' };
			const row = document.createElement('div');
			row.style.fontSize = '10px';
			row.style.marginBottom = '3px';
			row.style.display = 'flex';
			row.style.justifyContent = 'space-between';

			const nameSpan = document.createElement('span');
			const isEnabled = coverSourceSettings[key];
			nameSpan.innerText = `${isEnabled ? '●' : '○'} ${key}`;
			nameSpan.style.cursor = 'pointer';
			nameSpan.style.color = isEnabled ? '#fff' : '#777';
			nameSpan.onclick = (e) => {
				e.stopPropagation();
				coverSourceSettings[key] = !coverSourceSettings[key];
				localStorage.setItem('central-art-cover-sources', JSON.stringify(coverSourceSettings));
				updateDebugUI();
				updateContent();
			};

			const statusSpan = document.createElement('span');
			statusSpan.innerText = `${state.status}${state.detail ? ` (${state.detail})` : ''}`;
			if (state.status === 'Success') statusSpan.style.color = '#1db954';
			else if (state.status === 'Failed') statusSpan.style.color = '#e91429';
			else if (state.status === 'Disabled') statusSpan.style.color = '#7f7f7f';
			else statusSpan.style.color = '#b3b3b3';

			row.appendChild(nameSpan);
			row.appendChild(statusSpan);
			debugPanel.appendChild(row);
		});

		let rule = document.createElement('hr');
		rule.style.border = '0';
		rule.style.borderTop = '1px solid rgba(255, 255, 255, 0.1)';
		rule.style.margin = '6px 0';
		debugPanel.appendChild(rule);

		const trackTitle = document.createElement('div');
		trackTitle.style.fontWeight = 'bold';
		trackTitle.style.marginBottom = '6px';
		trackTitle.style.fontSize = '11px';
		trackTitle.style.color = '#fff';
		trackTitle.innerText = 'Album Tracklist Sources (Click to Toggle):';
		debugPanel.appendChild(trackTitle);

		Object.keys(DEFAULT_TRACK_SOURCES).forEach(key => {
			const state = trackDebugState[key] || { status: 'Idle', detail: '' };
			const row = document.createElement('div');
			row.style.fontSize = '10px';
			row.style.marginBottom = '3px';
			row.style.display = 'flex';
			row.style.justifyContent = 'space-between';

			const nameSpan = document.createElement('span');
			const isEnabled = trackSourceSettings[key];
			nameSpan.innerText = `${isEnabled ? '●' : '○'} ${key}`;
			nameSpan.style.cursor = 'pointer';
			nameSpan.style.color = isEnabled ? '#fff' : '#777';
			nameSpan.onclick = (e) => {
				e.stopPropagation();
				trackSourceSettings[key] = !trackSourceSettings[key];
				localStorage.setItem('central-art-track-sources', JSON.stringify(trackSourceSettings));
				updateDebugUI();
				updateContent();
			};

			const statusSpan = document.createElement('span');
			statusSpan.innerText = `${state.status}${state.detail ? ` (${state.detail})` : ''}`;
			if (state.status === 'Success') statusSpan.style.color = '#1db954';
			else if (state.status === 'Failed') statusSpan.style.color = '#e91429';
			else if (state.status === 'Disabled') statusSpan.style.color = '#7f7f7f';
			else statusSpan.style.color = '#b3b3b3';

			row.appendChild(nameSpan);
			row.appendChild(statusSpan);
			debugPanel.appendChild(row);
		});

		rule = document.createElement('hr');
		rule.style.border = '0';
		rule.style.borderTop = '1px solid rgba(255, 255, 255, 0.1)';
		rule.style.margin = '6px 0';
		debugPanel.appendChild(rule);

		const artistTitle = document.createElement('div');
		artistTitle.style.fontWeight = 'bold';
		artistTitle.style.marginBottom = '6px';
		artistTitle.style.fontSize = '11px';
		artistTitle.style.color = '#fff';
		artistTitle.innerText = 'Artist Profile Sources (Click to Toggle):';
		debugPanel.appendChild(artistTitle);

		Object.keys(DEFAULT_SOURCES).forEach(key => {
			const state = debugState[key] || { status: 'Idle', detail: '' };
			const row = document.createElement('div');
			row.style.fontSize = '10px';
			row.style.marginBottom = '3px';
			row.style.display = 'flex';
			row.style.justifyContent = 'space-between';

			const nameSpan = document.createElement('span');
			const isEnabled = sourceSettings[key];
			nameSpan.innerText = `${isEnabled ? '●' : '○'} ${key}`;
			nameSpan.style.cursor = 'pointer';
			nameSpan.style.color = isEnabled ? '#fff' : '#777';
			nameSpan.onclick = (e) => {
				e.stopPropagation();
				sourceSettings[key] = !sourceSettings[key];
				localStorage.setItem('central-art-sources', JSON.stringify(sourceSettings));
				updateDebugUI();
				triggerArtistImageReload();
			};

			const statusSpan = document.createElement('span');
			statusSpan.innerText = `${state.status}${state.detail ? ` (${state.detail})` : ''}`;
			if (state.status === 'Success') statusSpan.style.color = '#1db954';
			else if (state.status === 'Failed') statusSpan.style.color = '#e91429';
			else if (state.status === 'Disabled') statusSpan.style.color = '#7f7f7f';
			else statusSpan.style.color = '#b3b3b3';

			row.appendChild(nameSpan);
			row.appendChild(statusSpan);
			debugPanel.appendChild(row);
		});
	}

	async function fetchSpotifyInternalGraphQL(artistUri) {
		if (!artistUri) throw new Error('No Artist URI available');
		const GraphQL = Spicetify.GraphQL;
		if (!GraphQL) throw new Error('Spicetify.GraphQL object missing');

		const res = await GraphQL.Request({
			name: "queryArtistHeader",
			sha256Hash: "85ae04c8f522df1fa0672b10229a1d47a41416629e46a51d07b46e301d02c5ef",
			variables: { uri: artistUri }
		});
		const imgUrl = res?.data?.artistUnion?.visuals?.avatarImage?.sources?.[0]?.url;
		if (!imgUrl) throw new Error('GraphQL returned blank avatar field');
		return imgUrl;
	}

	async function fetchDeezer(artistName) {
		if (!artistName) throw new Error('No query term');
		const data = await requestExternalUrl(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artistName)}&limit=1`, false);
		const img = data?.data?.[0]?.picture_xl || data?.data?.[0]?.picture_big;
		if (!img) throw new Error('No match parsed from search');
		return img;
	}

	async function fetchAppleMusicOG(artistName) {
		if (!artistName) throw new Error('No query term');

		const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(artistName)}&entity=musicArtist&limit=1`;
		const searchData = await requestExternalUrl(searchUrl, false);
		const artistLink = searchData?.results?.[0]?.artistLinkUrl;
		if (!artistLink) throw new Error('Artist not indexed on iTunes');

		const html = await requestExternalUrl(artistLink, true);
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		const ogImageEl = doc.querySelector('meta[property="og:image"]');
		const imgUrl = ogImageEl?.getAttribute('content');
		if (!imgUrl) throw new Error('No og:image property found on page');

		return imgUrl.replace(/\/\d+x\d+bb/g, '/1000x1000bb');
	}

	async function fetchMusicBrainzWikidata(artistName) {
		if (!artistName) throw new Error('No query term');
		const mbData = await requestExternalUrl(`https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(artistName)}&fmt=json`, false);
		const artist = mbData?.artists?.[0];
		if (!artist) throw new Error('No entry found on MusicBrainz');

		const wikidataRel = artist.relations?.find(r => r.type === 'wikidata' || r.url?.resource?.includes('wikidata.org'));
		let wikidataId = '';
		if (wikidataRel) {
			const match = wikidataRel.url.resource.match(/Q\d+/);
			if (match) wikidataId = match[0];
		}

		if (!wikidataId) {
			const wdSearchData = await requestExternalUrl(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(artistName)}&language=en&format=json&origin=*`, false);
			wikidataId = wdSearchData?.search?.[0]?.id;
		}

		if (!wikidataId) throw new Error('No Wikidata identity resolved');

		const wdData = await requestExternalUrl(`https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${wikidataId}&property=P18&format=json&origin=*`, false);
		const filename = wdData?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
		if (!filename) throw new Error('Wikidata entry does not contain image claim');

		return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=1000`;
	}

	async function fetchAllMusic(artistName) {
		if (!artistName) throw new Error('No query term');
		const html = await requestExternalUrl(`https://www.allmusic.com/search/artists/${encodeURIComponent(artistName)}`, true);
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');
		const imgEl = doc.querySelector('.results li.artist .photo img, .photo img');
		const src = imgEl?.getAttribute('src') || imgEl?.getAttribute('data-src');
		if (!src) throw new Error('No photo elements parsed');
		return src;
	}

	async function probeHighResAlbumArt(albumTitle, artistName) {
		const results = [];
		if (!albumTitle || !artistName) return results;

		if (coverSourceSettings.ITUNES_COVER) {
			coverDebugState.ITUNES_COVER = { status: 'Searching...' };
			updateDebugUI();
			try {
				const searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(albumTitle + ' ' + artistName)}&entity=album&limit=1`;
				const data = await requestExternalUrl(searchUrl, false);
				const rawUrl = data?.results?.[0]?.artworkUrl100;
				const artistMatch = isArtistMatch(artistName, data?.results?.[0]?.artistName);
				const albumMatch = isAlbumMatch(albumTitle, data?.results?.[0]?.collectionName);
				if (artistMatch && albumMatch && rawUrl) {
					const hiResUrl = rawUrl.replace('100x100bb.jpg', '1400x1400bb.jpg');
					results.push({ url: hiResUrl, width: 1400, source: 'Apple Music', key: 'ITUNES_COVER' });
					coverDebugState.ITUNES_COVER = { status: 'Found (1400px)' };
				} else {
					throw new Error('Verification failed');
				}
			} catch (e) {
				coverDebugState.ITUNES_COVER = { status: 'Failed', detail: e.message || 'Error' };
			}
			updateDebugUI();
		}

		if (coverSourceSettings.DEEZER_COVER) {
			coverDebugState.DEEZER_COVER = { status: 'Searching...' };
			updateDebugUI();
			try {
				const searchUrl = `https://api.deezer.com/search/album?q=${encodeURIComponent(albumTitle + ' ' + artistName)}&limit=1`;
				const data = await requestExternalUrl(searchUrl, false);
				const coverXl = data?.data?.[0]?.cover_xl;
				const artistMatch = isArtistMatch(artistName, data?.data?.[0]?.artist?.name);
				const albumMatch = isAlbumMatch(albumTitle, data?.data?.[0]?.title);
				if (artistMatch && albumMatch && coverXl) {
					results.push({ url: coverXl, width: 1000, source: 'Deezer', key: 'DEEZER_COVER' });
					coverDebugState.DEEZER_COVER = { status: 'Found (1000px)' };
				} else {
					throw new Error('Verification failed');
				}
			} catch (e) {
				coverDebugState.DEEZER_COVER = { status: 'Failed', detail: e.message || 'Error' };
			}
			updateDebugUI();
		}

		return results;
	}

	async function triggerArtistImageReload() {
		const item = Spicetify.Player.data?.item;
		if (!item) return;

		const artistUri = item.artists?.[0]?.uri || item.metadata?.artist_uri;
		const artistName = item.artists?.[0]?.name || item.metadata?.artist_name || '';
        
		const localTrackUri = currentTrackUri; // barrier constraint

		Object.keys(DEFAULT_SOURCES).forEach(key => {
			if (!sourceSettings[key]) {
				debugState[key] = { status: 'Disabled', detail: '' };
			} else {
				debugState[key] = { status: 'Idle', detail: '' };
			}
		});
		updateDebugUI();

		const pipeline = [
			{ key: 'SPOTIFY_INTERNAL_GRAPHQL', fn: () => fetchSpotifyInternalGraphQL(artistUri) },
			{ key: 'DEEZER_API', fn: () => fetchDeezer(artistName) },
			{ key: 'APPLE_MUSIC_WEB', fn: () => fetchAppleMusicOG(artistName) },
			{ key: 'MUSICBRAINZ_WIKIDATA', fn: () => fetchMusicBrainzWikidata(artistName) },
			{ key: 'ALLMUSIC', fn: () => fetchAllMusic(artistName) }
		];

		let imageResolved = false;

		for (const stage of pipeline) {
			if (!sourceSettings[stage.key]) continue;

			debugState[stage.key] = { status: 'Searching...', detail: '' };
			updateDebugUI();

			try {
				const imgUrl = await stage.fn();
				if (imgUrl) {
					if (localTrackUri !== currentTrackUri) break; // discard stale load

					debugState[stage.key] = { status: 'Success', detail: '' };
					updateDebugUI();
					
					const tempImg = new Image();
					tempImg.onload = () => {
						if (localTrackUri !== currentTrackUri) return;

                        // Create and seamlessly inject new persistent artist image overlay
                        const newArtistImg = document.createElement('div');
                        newArtistImg.className = 'album-art-back-img';
                        newArtistImg.style.position = 'absolute';
                        newArtistImg.style.top = '0';
                        newArtistImg.style.left = '0';
                        newArtistImg.style.width = '100%';
                        newArtistImg.style.height = '100%';
                        newArtistImg.style.backgroundSize = 'cover';
                        newArtistImg.style.backgroundPosition = 'center';
                        newArtistImg.style.backgroundImage = `url('${imgUrl}')`;
                        newArtistImg.style.opacity = '0';
                        newArtistImg.style.transition = 'opacity 0.8s ease';
                        newArtistImg.style.zIndex = '0';
                        
                        const backOverlay = document.getElementById('album-art-face-back-overlay');
                        if (flipBack && backOverlay) {
                            flipBack.insertBefore(newArtistImg, backOverlay);
                            
                            void newArtistImg.offsetWidth; // invoke reflow
                            newArtistImg.style.opacity = '1';
                            
                            // Remove older layers underneath only once crossfade is completely finished
                            setTimeout(() => {
                                if (localTrackUri === currentTrackUri) {
                                    document.querySelectorAll('.album-art-back-img').forEach(el => {
                                        if (el !== newArtistImg) el.remove();
                                    });
                                }
                            }, 800);
                        }
					};
					tempImg.src = imgUrl;

					imageResolved = true;
					break;
				} else {
					throw new Error('Blank URL returned');
				}
			} catch (err) {
				debugState[stage.key] = { status: 'Failed', detail: err.message || 'Error' };
				updateDebugUI();
			}
		}

		if (!imageResolved) {
			console.warn('Spicetify Album Art Addon: All fallback configurations returned errors.');
		}
	}

	async function fetchSpotifyTracks(albumId) {
		const albumData = await fetchAlbumMetadata(albumId);
		if (!albumData) throw new Error('No database metadata');

		const rawType = albumData.album_type || 'album';
		const format = rawType.charAt(0).toUpperCase() + rawType.slice(1);
		const releaseYear = albumData.release_date ? albumData.release_date.split('-')[0] : '';

		const tracks = (albumData.tracks?.items || []).map(t => ({
			name: t.name,
			track_number: t.track_number,
			duration_ms: t.duration_ms,
			uri: t.uri
		}));

		return { format, releaseYear, tracks };
	}

	async function fetchDeezerTracks(albumTitle, artistName) {
		if (!albumTitle) throw new Error('No album title');
		const query = `${albumTitle} ${artistName}`.trim();
		const searchData = await requestExternalUrl(`https://api.deezer.com/search/album?q=${encodeURIComponent(query)}&limit=1`, false);
		const albumId = searchData?.data?.[0]?.id;
		if (!albumId) throw new Error('Album not resolved on Deezer');

		const albumData = await requestExternalUrl(`https://api.deezer.com/album/${albumId}`, false);
		const tracksData = await requestExternalUrl(`https://api.deezer.com/album/${albumId}/tracks`, false);

		const format = albumData.record_type ? albumData.record_type.charAt(0).toUpperCase() + albumData.record_type.slice(1) : 'Album';
		const releaseYear = albumData.release_date ? albumData.release_date.split('-')[0] : '';

		const tracks = (tracksData?.data || []).map((t, idx) => ({
			name: t.title,
			track_number: t.track_position || (idx + 1),
			duration_ms: t.duration * 1000,
			uri: ''
		}));

		return { format, releaseYear, tracks };
	}

	async function fetchMusicBrainzTracks(albumTitle, artistName) {
		if (!albumTitle) throw new Error('No album title');
		const query = `release:"${albumTitle}" AND artist:"${artistName}"`;
		const searchData = await requestExternalUrl(`https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(query)}&fmt=json`, false);
		const mbid = searchData?.releases?.[0]?.id;
		if (!mbid) throw new Error('Release not resolved on MusicBrainz');

		const releaseData = await requestExternalUrl(`https://musicbrainz.org/ws/2/release/${mbid}?inc=recordings&fmt=json`, false);

		const format = releaseData.release_group?.['primary-type'] || 'Album';
		const releaseYear = releaseData.date ? releaseData.date.split('-')[0] : '';

		const media = releaseData.media?.[0];
		const tracks = (media?.tracks || []).map((t, idx) => ({
			name: t.title || t.recording?.title,
			track_number: t.position || (idx + 1),
			duration_ms: t.length || t.recording?.length || 0,
			uri: ''
		}));

		return { format, releaseYear, tracks };
	}

	async function resolveTracklistData(albumId, albumTitle, artistName) {
		Object.keys(DEFAULT_TRACK_SOURCES).forEach(key => {
			if (!trackSourceSettings[key]) {
				trackDebugState[key] = { status: 'Disabled', detail: '' };
			} else {
				trackDebugState[key] = { status: 'Idle', detail: '' };
			}
		});
		updateDebugUI();

		const tracklistPipeline = [
			{
				key: 'SPOTIFY_TRACKS',
				enabled: trackSourceSettings.SPOTIFY_TRACKS && albumId,
				fn: () => fetchSpotifyTracks(albumId)
			},
			{
				key: 'DEEZER_TRACKS',
				enabled: trackSourceSettings.DEEZER_TRACKS,
				fn: () => fetchDeezerTracks(albumTitle, artistName)
			},
			{
				key: 'MUSICBRAINZ_TRACKS',
				enabled: trackSourceSettings.MUSICBRAINZ_TRACKS,
				fn: () => fetchMusicBrainzTracks(albumTitle, artistName)
			}
		];

		for (const stage of tracklistPipeline) {
			if (!stage.enabled) continue;

			trackDebugState[stage.key] = { status: 'Searching...', detail: '' };
			updateDebugUI();

			try {
				const result = await stage.fn();
				if (result && result.tracks?.length > 0) {
					trackDebugState[stage.key] = { status: 'Success', detail: `${result.tracks.length} tracks` };
					updateDebugUI();
					return result;
				} else {
					throw new Error('No tracks retrieved');
				}
			} catch (err) {
				trackDebugState[stage.key] = { status: 'Failed', detail: err.message || 'Error' };
				updateDebugUI();
			}
		}

		throw new Error('All tracklist pipelines failed');
	}

	function applyTransform(xPercent, yPercent, animate = false, proximity = 1.0) {
		if (!flipInner) return;

		const tiltDampening = 1 / (1 + (zoomScale - 1) * 1.5);
		const currentMaxTilt = 17 * tiltDampening;

		const activeProximity = Math.max(0.001, proximity);
		const rotateX = -yPercent * currentMaxTilt * activeProximity;
		const rotateY = (isFlipped ? 180 : 0) + (xPercent * currentMaxTilt * activeProximity);

		const baseScale = 0.33333;
		const hoverScaleFactor = 1.03;
		const activeScale = 1.0 + (hoverScaleFactor - 1.0) * activeProximity;
		const scale = baseScale * activeScale * zoomScale;

		let panX = 0;
		let panY = 0;
		if (zoomScale > 1.0) {
			const panFactor = (zoomScale - 1.0) * (26 + (zoomScale - 1.0) * 12) / 3;
			panX = -xPercent * panFactor * activeProximity;
			panY = -yPercent * panFactor * activeProximity;
		}

		const shadowX = -xPercent * 24 * (isFlipped ? -1 : 1) * activeProximity;
		const shadowY = (-yPercent * 24 + 20) * activeProximity;

		if (animate || isAnimatingFlip) {
			flipInner.style.transition = 'transform 0.6s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.6s cubic-bezier(0.25, 1, 0.5, 1)';
		} else {
			flipInner.style.transition = 'transform 0.1s cubic-bezier(0.15, 0.85, 0.45, 1), box-shadow 0.1s cubic-bezier(0.15, 0.85, 0.45, 1)';
		}

		flipInner.style.transform = `translate3d(${panX}%, ${panY}%, 1.001px) rotateX(${rotateX || 0.001}deg) rotateY(${rotateY || 0.001}deg) scale3d(${scale}, ${scale}, ${scale})`;
		flipInner.style.boxShadow = `${shadowX}px ${shadowY}px 50px rgba(0, 0, 0, ${0.9 * activeProximity})`;

		// Environment reflection maps inversely for depth, fading entirely if mouse leaves bounds
		const envX = 50 + (xPercent * 20 * activeProximity);
		const envY = 50 + (yPercent * 20 * activeProximity);

		// Mathematically bound constraints for 400% scale plastic layer mapping (keeps center contained securely inside boundaries)
		const maskSize = 4; // 400%
		const cX = 0.5 + (xPercent * 0.6 * activeProximity);
		const cY = 0.5 + (yPercent * 0.6 * activeProximity);
		const sheenX = ((maskSize / 2 - cX) / (maskSize - 1)) * 100;
		const sheenY = ((maskSize / 2 - cY) / (maskSize - 1)) * 100;

		// Base targets fade out to perfectly 0 entirely when interaction ends, maintaining matte cover when passive
		const targetEnvOpacity = (isHovered && glossMode) ? 0.1 : 0;
		const targetPlasticOpacity = (isHovered && plasticMode) ? 0.8 : 0;

		const transStr = (animate || isAnimatingFlip)
			? 'background-position 0.6s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.6s ease'
			: 'background-position 0.1s cubic-bezier(0.15, 0.85, 0.45, 1), opacity 0.3s ease';

		const maskTransStr = (animate || isAnimatingFlip)
			? '-webkit-mask-position 0.6s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.6s ease'
			: '-webkit-mask-position 0.1s cubic-bezier(0.15, 0.85, 0.45, 1), opacity 0.3s ease';

		const frontEnv = document.getElementById('album-art-front-env');
		const frontPlastic = document.getElementById('album-art-front-plastic');
		if (frontEnv) {
			frontEnv.style.transition = transStr;
			frontEnv.style.backgroundPosition = `${envX}% ${envY}%`;
			// @ts-ignore
			frontEnv.style.opacity = targetEnvOpacity;
		}
		if (frontPlastic) {
			frontPlastic.style.transition = maskTransStr;
			frontPlastic.style.webkitMaskPosition = `${sheenX}% ${sheenY}%`;
			// @ts-ignore
			frontPlastic.style.opacity = targetPlasticOpacity;
		}

		const backEnv = document.getElementById('album-art-back-env');
		const backPlastic = document.getElementById('album-art-back-plastic');
		if (backEnv) {
			backEnv.style.transition = transStr;
			backEnv.style.backgroundPosition = `${envX}% ${envY}%`;
			// @ts-ignore
			backEnv.style.opacity = targetEnvOpacity;
		}
		if (backPlastic) {
			backPlastic.style.transition = maskTransStr;
			backPlastic.style.webkitMaskPosition = `${sheenX}% ${sheenY}%`;
			// @ts-ignore
			backPlastic.style.opacity = targetPlasticOpacity;
		}
	}

	function createOverlay() {
		if (overlay) return;

		overlay = document.createElement('div');
		overlay.id = 'album-art-overlay';

		bgBlur = document.createElement('div');
		bgBlur.id = 'album-art-overlay-blur';
		overlay.appendChild(bgBlur);

		const container = document.createElement('div');
		container.id = 'album-art-overlay-container';

		imgWrapper = document.createElement('div');
		imgWrapper.id = 'album-art-img-wrapper';

		flipInner = document.createElement('div');
		flipInner.id = 'album-art-flip-inner';

		// --- Front Face + Overlay Textures Setup ---
		const faceFront = document.createElement('div');
		faceFront.className = 'album-art-face';
		faceFront.id = 'album-art-face-front';
		mainImg = document.createElement('img');

		const frontDamage = document.createElement('div');
		frontDamage.className = 'album-art-texture album-art-damage';

		const frontEnv = document.createElement('div');
		frontEnv.className = 'album-art-texture album-art-env';
		frontEnv.id = 'album-art-front-env';

		const frontPlastic = document.createElement('div');
		frontPlastic.className = 'album-art-texture album-art-plastic';
		frontPlastic.id = 'album-art-front-plastic';

		faceFront.append(mainImg, frontDamage, frontEnv, frontPlastic);

		// --- Back Face + Overlay Textures Setup ---
		flipBack = document.createElement('div');
		flipBack.className = 'album-art-face';
		flipBack.id = 'album-art-face-back';

		const backOverlay = document.createElement('div');
		backOverlay.id = 'album-art-face-back-overlay';

		const lTitle = document.createElement('div'); lTitle.id = 'album-art-back-label-title'; lTitle.className = 'back-label'; lTitle.innerText = 'Track';
		backTitleEl = document.createElement('h2'); backTitleEl.id = 'album-art-back-title';

		const lArtist = document.createElement('div'); lArtist.className = 'back-label'; lArtist.innerText = 'Artist';
		backArtistEl = document.createElement('h3'); backArtistEl.id = 'album-art-back-artist';
		backArtistEl.className = 'back-value-text clickable-link';
		backArtistEl.onclick = (e) => {
			e.stopPropagation();
			const item = Spicetify.Player.data?.item;
			const artistUri = item?.artists?.[0]?.uri || item?.metadata?.artist_uri;
			if (artistUri) {
				const path = artistUri.replace('spotify:', '/').replace(/:/g, '/');
				toggleView();
				Spicetify.Platform.History.push(path);
			}
		};

		const lAlbum = document.createElement('div'); lAlbum.id = 'album-art-back-label-album'; lAlbum.className = 'back-label'; lAlbum.innerText = 'Album';
		backAlbumEl = document.createElement('p'); backAlbumEl.id = 'album-art-back-album';
		backAlbumEl.className = 'back-value-text clickable-link';
		backAlbumEl.onclick = (e) => {
			e.stopPropagation();
			const item = Spicetify.Player.data?.item;
			const albumUri = item?.album?.uri || item?.metadata?.album_uri;
			if (albumUri) {
				const path = albumUri.replace('spotify:', '/').replace(/:/g, '/');
				toggleView();
				Spicetify.Platform.History.push(path);
			}
		};

		const lFormat = document.createElement('div'); lFormat.id = 'album-art-back-label-format'; lFormat.className = 'back-label'; lFormat.innerText = 'Year';
		backFormatEl = document.createElement('p'); backFormatEl.id = 'album-art-back-format';
		backFormatEl.className = 'back-value-text';

		const lTracklist = document.createElement('div'); lTracklist.id = 'album-art-back-label-tracklist'; lTracklist.className = 'back-label'; lTracklist.innerText = 'Tracks';
		backTracklistEl = document.createElement('div');
		backTracklistEl.id = 'album-art-back-tracklist';

		// Sleeve Single-Line Fineprint Footer & Dynamic Realism Toggles
		const fineprint = document.createElement('div');
		fineprint.id = 'album-art-back-fineprint';

		const fineprintCredits = document.createElement('span');
		fineprintCredits.innerText = 'Addon vibecoded with Gemini by lelaksi';

		statusIndicator = document.createElement('span');
		statusIndicator.id = 'album-art-back-status-indicator';
		statusIndicator.innerText = 'Syncing';

		const mkDot = () => { const d = document.createElement('span'); d.style.color = '#333'; d.innerText = ' • '; return d; };

		// Helper string toggle generator
		const createToggle = (label, getVal, setVal, onUpdate) => {
			const btn = document.createElement('span');
			btn.className = 'fineprint-btn';
			btn.innerText = label;
			const updateState = () => {
				btn.style.color = getVal() ? '#b3b3b3' : '#535353';
				btn.style.textDecoration = getVal() ? 'underline' : 'none';
			};
			updateState();
			btn.onclick = (e) => {
				e.stopPropagation();
				setVal(!getVal());
				updateState();
				if (onUpdate) onUpdate(getVal());
			};
			return btn;
		};

		debugToggleBtn = createToggle('Debug', () => debugMode, (v) => {
			debugMode = v;
			localStorage.setItem('central-art-debug', v ? 'true' : 'false');
		}, updateDebugUI);

		const damageToggleBtn = createToggle('Damage', () => damageMode, (v) => {
			damageMode = v;
			localStorage.setItem('central-art-damage', v ? 'true' : 'false');
		}, (v) => {
			document.querySelectorAll('.album-art-damage').forEach(el => {
				// @ts-ignore
				el.style.display = v ? 'block' : 'none';
			});
		});

		const glossToggleBtn = createToggle('Gloss', () => glossMode, (v) => {
			glossMode = v;
			localStorage.setItem('central-art-gloss', v ? 'true' : 'false');
		}, (v) => {
			if (!v) {
				document.querySelectorAll('.album-art-env').forEach(el => {
					// @ts-ignore
					el.style.opacity = '0';
				});
			}
		});

		const plasticToggleBtn = createToggle('Plastic', () => plasticMode, (v) => {
			plasticMode = v;
			localStorage.setItem('central-art-plastic', v ? 'true' : 'false');
		}, (v) => {
			if (!v) {
				document.querySelectorAll('.album-art-plastic').forEach(el => {
					// @ts-ignore
					el.style.opacity = '0';
				});
			}
		});

		fineprint.append(
			fineprintCredits, mkDot(), statusIndicator, mkDot(),
			debugToggleBtn, mkDot(), damageToggleBtn, mkDot(), glossToggleBtn, mkDot(), plasticToggleBtn
		);

		debugPanel = document.createElement('div');
		debugPanel.id = 'album-art-debug-panel';

		backOverlay.append(lTitle, backTitleEl, lArtist, backArtistEl, lAlbum, backAlbumEl, lFormat, backFormatEl, lTracklist, backTracklistEl, debugPanel, fineprint);

		const backDamage = document.createElement('div');
		backDamage.className = 'album-art-texture album-art-damage';

		const backEnv = document.createElement('div');
		backEnv.className = 'album-art-texture album-art-env';
		backEnv.id = 'album-art-back-env';

		const backPlastic = document.createElement('div');
		backPlastic.className = 'album-art-texture album-art-plastic';
		backPlastic.id = 'album-art-back-plastic';

		// Set initial visibility on textures from saved configuration
		const initialDamageDisplay = damageMode ? 'block' : 'none';
		frontDamage.style.display = initialDamageDisplay;
		backDamage.style.display = initialDamageDisplay;

		flipBack.append(backOverlay, backDamage, backEnv, backPlastic);

		flipInner.append(faceFront, flipBack);
		imgWrapper.appendChild(flipInner);

		setupPhysics(imgWrapper, flipInner);
		container.appendChild(imgWrapper);

		const meta = document.createElement('div');
		meta.id = 'album-art-overlay-meta';

		titleEl = document.createElement('span');
		titleEl.id = 'album-art-overlay-title';
		meta.appendChild(titleEl);

		const divider = document.createElement('span');
		divider.id = 'album-art-overlay-divider';
		divider.innerText = ' — ';
		meta.appendChild(divider);

		artistEl = document.createElement('span');
		artistEl.id = 'album-art-overlay-artist';
		artistEl.onclick = (e) => {
			e.stopPropagation();
			const item = Spicetify.Player.data?.item;
			const artistUri = item?.artists?.[0]?.uri || item?.metadata?.artist_uri;
			if (artistUri) {
				const path = artistUri.replace('spotify:', '/').replace(/:/g, '/');
				toggleView();
				Spicetify.Platform.History.push(path);
			}
		};
		meta.appendChild(artistEl);

		container.appendChild(meta);
		overlay.appendChild(container);

		updateDebugUI();
	}

	function setupPhysics(wrapper, inner) {
		overlay.addEventListener('mousemove', (e) => {
			const rect = wrapper.getBoundingClientRect();
			const x = e.clientX - rect.left;
			const y = e.clientY - rect.top;

			const centerX = rect.width / 2;
			const centerY = rect.height / 2;

			const rawX = (x - centerX) / centerX;
			const rawY = (y - centerY) / centerY;

			const distance = Math.sqrt(rawX * rawX + rawY * rawY);

			let proximityFactor = 1.0;

			if (zoomScale === MIN_ZOOM) {
				const innerRadius = 1.0;
				const outerRadius = 1.25;

				if (distance <= innerRadius) {
					proximityFactor = 1.0;
				} else if (distance > outerRadius) {
					proximityFactor = 0.0;
				} else {
					proximityFactor = 1.0 - (distance - innerRadius) / (outerRadius - innerRadius);
				}
			}

			if (proximityFactor > 0.0) {
				isHovered = true;
				lastPercentX = Math.max(-1.1, Math.min(1.1, rawX));
				lastPercentY = Math.max(-1.1, Math.min(1.1, rawY));
				applyTransform(lastPercentX, lastPercentY, false, proximityFactor);
			} else {
				if (isHovered) {
					isHovered = false;
					lastPercentX = 0.0001;
					lastPercentY = 0.0001;
					applyTransform(0.0001, 0.0001, true, 0.0001);
				}
			}
		});

		wrapper.addEventListener('click', (e) => {
			// @ts-ignore
			if (e.target.closest('#album-art-debug-panel') || e.target.closest('#album-art-back-fineprint') || e.target.closest('.clickable-link')) {
				return;
			}

			isFlipped = !isFlipped;
			isAnimatingFlip = true;
			
			clearTimeout(flipTimeout);
			flipTimeout = setTimeout(() => { isAnimatingFlip = false; }, 600);

			const metaContainer = document.getElementById('album-art-overlay-meta');
			if (metaContainer) metaContainer.style.opacity = isFlipped ? '0' : '1';

			applyTransform(lastPercentX, lastPercentY, true);
		});

		overlay.addEventListener('wheel', (e) => {
			if (!isHovered && zoomScale === MIN_ZOOM) return;

			e.preventDefault();
			const delta = -e.deltaY;
			const zoomSpeed = 0.12;

			const oldZoom = zoomScale;
			if (delta > 0) {
				zoomScale = Math.min(MAX_ZOOM, zoomScale + zoomSpeed);
			} else {
				zoomScale = Math.max(MIN_ZOOM, zoomScale - zoomSpeed);
			}

			if (zoomScale === MIN_ZOOM && oldZoom > MIN_ZOOM) {
				const rect = wrapper.getBoundingClientRect();
				const isInside = (
					e.clientX >= rect.left && e.clientX <= rect.right &&
					e.clientY >= rect.top && e.clientY <= rect.bottom
				);
				if (!isInside) {
					isHovered = false;
					lastPercentX = 0.0001;
					lastPercentY = 0.0001;
					applyTransform(0.0001, 0.0001, true, 0.0001);
					return;
				}
			}

			applyTransform(lastPercentX, lastPercentY, false);
		}, { passive: false });

		overlay.addEventListener('mouseleave', () => {
			isHovered = false;
			lastPercentX = 0.0001;
			lastPercentY = 0.0001;
			zoomScale = MIN_ZOOM;
			applyTransform(0.0001, 0.0001, true, 0.0001);
		});
	}

	function tryNextUrl() {
		if (chainIndex < urlChain.length) {
			const url = urlChain[chainIndex];
			mainImg.src = url;
			bgBlur.style.backgroundImage = `url('${url}')`;
		} else {
			mainImg.src = '';
			bgBlur.style.backgroundImage = 'none';
		}
	}

	function updateContent() {
		if (!isViewActive || !overlay) return;

		const item = Spicetify.Player.data?.item;
		if (!item) return;

		const activeUri = item.uri || '';
		const isInitialLoad = !titleEl.textContent;
		const isNewTrack = currentTrackUri !== activeUri;

		currentTrackUri = activeUri;

		const trackTitle = item.metadata?.title || 'Unknown Title';
		const trackArtist = item.metadata?.artist_name || 'Unknown Artist';
		const trackAlbum = item.metadata?.album_title || 'Unknown Album';
		const albumId = (item.album?.uri || item.metadata?.album_uri)?.split(':')[2];

		const metaContainer = document.getElementById('album-art-overlay-meta');
		const backOverlay = document.getElementById('album-art-face-back-overlay');

		const updateDOM = () => {
			if (currentTrackUri !== activeUri) return; // stale execution barrier

			// Wipe out all dynamically placed hi-res/artist overrides to make way for the new track
			document.querySelectorAll('.album-art-back-img, .hi-res-overlay, .bg-blur-overlay').forEach(el => el.remove());

			if (isFlipped && flipInner) {
				isFlipped = false;
				flipInner.style.transition = 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
				flipInner.style.transform = `rotateX(0deg) rotateY(0deg) scale3d(0.33333, 0.33333, 0.33333)`;
			}

			titleEl.textContent = trackTitle;
			artistEl.textContent = trackArtist;
			backTitleEl.textContent = trackTitle;
			backArtistEl.textContent = trackArtist;
			backAlbumEl.textContent = trackAlbum;

			const lTitleEl = document.getElementById('album-art-back-label-title');
			const lAlbumEl = document.getElementById('album-art-back-label-album');
			const lFormatEl = document.getElementById('album-art-back-label-format');
			const backFormatEl = document.getElementById('album-art-back-format');
			const lTracklistEl = document.getElementById('album-art-back-label-tracklist');
			const backTracklistEl = document.getElementById('album-art-back-tracklist');

			if (lTitleEl) lTitleEl.style.display = 'block';
			if (backTitleEl) backTitleEl.style.display = 'block';
			if (lAlbumEl) lAlbumEl.innerText = 'Album';
			
			if (lFormatEl) { lFormatEl.style.display = 'none'; lFormatEl.style.opacity = '0'; }
			if (backFormatEl) { backFormatEl.style.display = 'none'; backFormatEl.style.opacity = '0'; }
			if (lTracklistEl) { lTracklistEl.style.display = 'none'; lTracklistEl.style.opacity = '0'; }
			if (backTracklistEl) { backTracklistEl.style.display = 'none'; backTracklistEl.style.opacity = '0'; }

			backFormatEl.textContent = item.metadata?.release_year || '';
			if (item.metadata?.release_year && lFormatEl) {
				lFormatEl.style.display = 'block';
				backFormatEl.style.display = 'block';
			}
			
			statusIndicator.textContent = 'Syncing';
			backTracklistEl.innerHTML = '';

			requestAnimationFrame(() => {
				if (metaContainer && !isFlipped) metaContainer.style.opacity = '1';
				if (backOverlay) backOverlay.style.opacity = '1';
			});

			urlChain = [
				coverSourceSettings.SPOTIFY_XL ? resolveUrl('METADATA_XLARGE', item) : '',
				resolveUrl('FORCE_B273', item),
				resolveUrl('ALBUM_IMAGES_0', item),
				resolveUrl('METADATA_STANDARD', item)
			].filter(url => url !== '');

			mainImg.onerror = () => { chainIndex++; tryNextUrl(); };
			chainIndex = 0;
			tryNextUrl();
			triggerArtistImageReload();

			resolveTracklistData(albumId, trackAlbum, trackArtist)
				.then(result => {
					if (currentTrackUri !== activeUri) return;

					statusIndicator.textContent = 'Synced';

					if (result.releaseYear) {
						if (lFormatEl) lFormatEl.style.display = 'block';
						if (backFormatEl) {
							backFormatEl.style.display = 'block';
							backFormatEl.textContent = `${result.releaseYear}`;
						}
					}

					const isSingleType = result.format?.toLowerCase() === 'single';
					if (isSingleType && lAlbumEl) {
						lAlbumEl.innerText = 'Single';
						backAlbumEl.textContent = trackAlbum;
					} else if (lAlbumEl) {
						lAlbumEl.innerText = 'Album';
						backAlbumEl.textContent = trackAlbum;
					}

					if (lTitleEl) lTitleEl.style.display = 'none';
					if (backTitleEl) backTitleEl.style.display = 'none';

					backTracklistEl.innerHTML = '';

					const tracks = result.tracks || [];
					const maxTracksPerColumn = 12;
					const numColumns = Math.min(3, Math.ceil(tracks.length / maxTracksPerColumn));
					const tracksPerColumn = Math.ceil(tracks.length / numColumns);

					if (tracks.length > 0 && lTracklistEl) {
						lTracklistEl.style.display = 'block';
						backTracklistEl.style.display = 'flex';
					}

					for (let c = 0; c < numColumns; c++) {
						const colDiv = document.createElement('div');
						colDiv.className = 'tracklist-column';

						const colTracks = tracks.slice(c * tracksPerColumn, (c + 1) * tracksPerColumn);
						colTracks.forEach((track, index) => {
							const trackIdx = c * tracksPerColumn + index;
							const itemEl = document.createElement('div');
							itemEl.className = 'tracklist-item';

							if (tracks.length >= 10 && tracks.length <= 12) {
								itemEl.style.fontSize = '4.2vh';
								itemEl.style.padding = '10px 0';
							}

							const isCurrent = (track.uri && track.uri === activeUri) ||
								(!track.uri && track.name.toLowerCase().trim() === trackTitle.toLowerCase().trim());

							if (isCurrent) {
								itemEl.classList.add('active');
							}

							const numSpan = document.createElement('span');
							numSpan.className = 'tracklist-number';
							numSpan.textContent = track.track_number || (trackIdx + 1);

							const nameSpan = document.createElement('span');
							nameSpan.className = `tracklist-name cols-${numColumns}`;
							nameSpan.textContent = track.name;

							const durationSpan = document.createElement('span');
							durationSpan.className = 'tracklist-duration';
							const min = Math.floor(track.duration_ms / 60000);
							const sec = Math.floor((track.duration_ms % 60000) / 1000).toString().padStart(2, '0');
							durationSpan.textContent = `${min}:${sec}`;

							const infoWrapper = document.createElement('div');
							infoWrapper.style.display = 'flex';
							infoWrapper.style.alignItems = 'center';
							infoWrapper.style.maxWidth = '80%';
							infoWrapper.append(numSpan, nameSpan);

							itemEl.append(infoWrapper, durationSpan);
							colDiv.appendChild(itemEl);
						});

						backTracklistEl.appendChild(colDiv);
					}

					// Force hardware reflow ensuring the async fade-in transitions execute smoothly from 0% opacity
					void lFormatEl?.offsetWidth;
					void backFormatEl?.offsetWidth;
					void lTracklistEl?.offsetWidth;
					void backTracklistEl?.offsetWidth;

					requestAnimationFrame(() => {
						if (lFormatEl) lFormatEl.style.opacity = '1';
						if (backFormatEl) backFormatEl.style.opacity = '1';
						if (lTracklistEl) lTracklistEl.style.opacity = '1';
						if (backTracklistEl) backTracklistEl.style.opacity = '1';
					});
				})
				.catch(err => {
					if (currentTrackUri !== activeUri) return;
					
					statusIndicator.textContent = 'Offline';
					backFormatEl.textContent = item.metadata?.release_year || '';
					if (lFormatEl && item.metadata?.release_year) lFormatEl.style.display = 'block';

					if (lTracklistEl) lTracklistEl.style.display = 'none';
					backTracklistEl.innerHTML = '';

					void lFormatEl?.offsetWidth;
					void backFormatEl?.offsetWidth;

					requestAnimationFrame(() => {
						if (lFormatEl) lFormatEl.style.opacity = '1';
						if (backFormatEl) backFormatEl.style.opacity = '1';
					});
				});

			mainImg.onload = () => {
				mainImg.onload = null;
				mainImg.style.opacity = '1';

				const currentWidth = mainImg.naturalWidth || 640;

				coverDebugState = {
					SPOTIFY_XL: { status: 'Success', detail: `${currentWidth}px` },
					ITUNES_COVER: { status: coverSourceSettings.ITUNES_COVER ? 'Idle' : 'Disabled' },
					DEEZER_COVER: { status: coverSourceSettings.DEEZER_COVER ? 'Idle' : 'Disabled' }
				};
				updateDebugUI();

				probeHighResAlbumArt(trackAlbum, trackArtist).then(probedResults => {
					if (currentTrackUri !== activeUri) return;

					const betterImage = probedResults
						.filter(res => res.width > currentWidth)
						.sort((a, b) => b.width - a.width)[0];

					if (betterImage) {
						const tempImg = new Image();
						tempImg.onload = () => {
							if (currentTrackUri !== activeUri) return;
							if (tempImg.naturalWidth > currentWidth) {
                                
                                // Stack new hi-res front image directly on top of the old rather than destroying it
                                const newMain = document.createElement('img');
                                newMain.className = 'hi-res-overlay';
                                newMain.src = betterImage.url;
                                newMain.style.position = 'absolute';
                                newMain.style.top = '0';
                                newMain.style.left = '0';
                                newMain.style.width = '100%';
                                newMain.style.height = '100%';
                                newMain.style.objectFit = 'cover';
                                newMain.style.opacity = '0';
                                newMain.style.transition = 'opacity 0.8s ease';
                                newMain.style.zIndex = '2';

                                const faceFront = document.getElementById('album-art-face-front');
                                if (faceFront) {
                                    faceFront.insertBefore(newMain, mainImg.nextSibling);
                                    void newMain.offsetWidth;
                                    newMain.style.opacity = '1';
                                }

                                // Apply persistent stacking pattern to background blur wrapper
                                const newBlur = document.createElement('div');
                                newBlur.className = 'bg-blur-overlay';
                                newBlur.style.position = 'absolute';
                                newBlur.style.top = '-40px';
                                newBlur.style.left = '-40px';
                                newBlur.style.width = 'calc(100% + 80px)';
                                newBlur.style.height = 'calc(100% + 80px)';
                                newBlur.style.backgroundSize = 'cover';
                                newBlur.style.backgroundPosition = 'center';
                                newBlur.style.filter = 'blur(50px) brightness(0.35)';
                                newBlur.style.zIndex = '1';
                                newBlur.style.backgroundImage = `url('${betterImage.url}')`;
                                newBlur.style.opacity = '0';
                                newBlur.style.transition = 'opacity 0.8s ease';

                                if (bgBlur && bgBlur.parentElement) {
                                    bgBlur.parentElement.insertBefore(newBlur, bgBlur.nextSibling);
                                    void newBlur.offsetWidth;
                                    newBlur.style.opacity = '1';
                                }

								coverDebugState[betterImage.key] = { status: 'Success', detail: `${tempImg.naturalWidth}px` };
								coverDebugState.SPOTIFY_XL = { status: 'Superseded', detail: `${currentWidth}px` };
								updateDebugUI();
							}
						};
						tempImg.src = betterImage.url;
					}
				});
			};
		};

		// Elegant cross-fade track logic router
		if (isNewTrack && !isInitialLoad) {
			if (metaContainer) metaContainer.style.opacity = '0';
			if (backOverlay) backOverlay.style.opacity = '0';
			if (mainImg) mainImg.style.opacity = '0';
            
            // Allow all previous image overlays to elegantly ghost out alongside the main interface 
            document.querySelectorAll('.album-art-back-img, .hi-res-overlay, .bg-blur-overlay').forEach(el => {
                // @ts-ignore
                el.style.opacity = '0';
            });
			
			setTimeout(updateDOM, 300);
		} else {
			if (mainImg) mainImg.style.opacity = '0';
			updateDOM();
		}
	}

	function resetInteractionState() {
		zoomScale = MIN_ZOOM;
		lastPercentX = 0.0001;
		lastPercentY = 0.0001;
		isHovered = false;
		isFlipped = false;
		isAnimatingFlip = false;
		
        // Ensure ghosted elements are wiped completely off the DOM if interaction is abruptly ended
        document.querySelectorAll('.album-art-back-img, .hi-res-overlay, .bg-blur-overlay').forEach(el => el.remove());
		
		if (flipInner) {
			flipInner.style.transition = 'none';
			applyTransform(0.0001, 0.0001, false, 0.0001);
			void flipInner.offsetWidth;
		}
		
		const metaContainer = document.getElementById('album-art-overlay-meta');
		if (metaContainer) {
			metaContainer.style.transition = 'none';
			metaContainer.style.opacity = '1';
			void metaContainer.offsetWidth;
			metaContainer.style.transition = 'opacity 0.3s ease';
		}
	}

	function toggleView() {
		const rootMainView = document.querySelector('.Root__main-view') || document.querySelector('.main-view-container');
		if (!rootMainView) return;

		isViewActive = !isViewActive;
		localStorage.setItem('central-art-active', isViewActive ? 'true' : 'false');

		if (isViewActive) {
			document.body.classList.add('central-art-active');
			
			const currentPath = Spicetify.Platform.History.location.pathname;
			if (currentPath !== '/central-art') {
				localStorage.setItem('central-art-prev-path', currentPath + Spicetify.Platform.History.location.search);
				Spicetify.Platform.History.push('/central-art');
			}

			createOverlay();
			rootMainView.appendChild(overlay);
			resetInteractionState();
			updateContent();
		} else {
			document.body.classList.remove('central-art-active');
			if (overlay) overlay.remove();
			
			const currentPath = Spicetify.Platform.History.location.pathname;
			if (currentPath === '/central-art') {
				const prevPath = localStorage.getItem('central-art-prev-path') || '/';
				Spicetify.Platform.History.push(prevPath);
			}
		}
		updateButtonState();
	}

	function updateButtonState() {
		const btn = document.getElementById('album-art-toggle-btn');
		if (!btn) return;

		btn.setAttribute('aria-pressed', isViewActive ? 'true' : 'false');
		if (isViewActive) {
			btn.classList.add('ControlButton--active', 'main-nowPlayingBar-button--active');
		} else {
			btn.classList.remove('ControlButton--active', 'main-nowPlayingBar-button--active');
		}
	}

	const artIcon = `
    <svg role="img" height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M1 2a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2zm13 0H2v12h12V2zM4.5 4.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM3 11.5l3-3.5 2 2 2.5-3.5 2.5 5H3z"/>
    </svg>
`;

	function injectPlaybarButton() {
		const barRight = document.querySelector('.main-nowPlayingBar-right');
		if (!barRight) return;

		const existingBtn = document.getElementById('album-art-toggle-btn');
		if (existingBtn) {
			updateButtonState();
			return;
		}

		const button = document.createElement('button');
		button.id = 'album-art-toggle-btn';

		const lyricsBtn = barRight.querySelector('button[data-testid="lyrics-button"]') ||
			barRight.querySelector('.main-nowPlayingBar-lyricsButton') ||
			barRight.querySelector('button[aria-label="Lyrics"]');

		if (lyricsBtn) {
			button.className = lyricsBtn.className;
			button.classList.remove('ControlButton--active', 'main-nowPlayingBar-button--active');
		} else {
			button.className = 'main-nowPlayingBar-button ControlButton';
		}

		button.setAttribute('aria-label', 'Toggle Central Album Art');
		button.style.cursor = 'pointer';
		button.innerHTML = artIcon;

		button.addEventListener('click', toggleView);

		if (lyricsBtn) {
			lyricsBtn.parentNode.insertBefore(button, lyricsBtn.nextSibling);
		} else {
			const children = barRight.children;
			if (children.length > 1) {
				barRight.insertBefore(button, children[children.length - 1]);
			} else {
				barRight.appendChild(button);
			}
		}

		updateButtonState();
	}

	setInterval(injectPlaybarButton, 1000);

	let lastPath = Spicetify.Platform.History.location?.pathname + Spicetify.Platform.History.location?.search;
	if (lastPath && lastPath.includes("undefined")) lastPath = window.location.pathname + window.location.search;

	Spicetify.Platform.History.listen((location) => {
		const currentPath = location.pathname;
		if (isViewActive && currentPath !== '/central-art') {
			isViewActive = false;
			localStorage.setItem('central-art-active', 'false');
			document.body.classList.remove('central-art-active');
			if (overlay) overlay.remove();
			updateButtonState();
		}
	});

	function initializeState() {
		if (isViewActive) {
			const checkMainView = setInterval(() => {
				const rootMainView = document.querySelector('.Root__main-view') || document.querySelector('.main-view-container');
				if (rootMainView) {
					clearInterval(checkMainView);
					
					document.body.classList.add('central-art-active');
					createOverlay();
					rootMainView.appendChild(overlay);
					resetInteractionState();
					updateContent();
					
					const currentPath = Spicetify.Platform.History.location.pathname;
					if (currentPath !== '/central-art') {
						localStorage.setItem('central-art-prev-path', currentPath + Spicetify.Platform.History.location.search);
						Spicetify.Platform.History.push('/central-art');
					}
				}
			}, 300);
		}
	}

	Spicetify.Player.addEventListener('songchange', updateContent);
	initializeState();
})();