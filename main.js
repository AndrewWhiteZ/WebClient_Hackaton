import axios from 'https://cdn.jsdelivr.net/npm/axios@1.3.5/+esm';

const INITIALIZING = 0;
const DEVICE = 1;
const TRANSMITTING = 2;
const ERROR = 3;

let state = INITIALIZING;
let errorMessage = '';
let responseMessage = '';

let fileTransmit = document.getElementById("fileTransmit");
let onlineCapture = document.getElementById("onlineCapture");
let fileInputForm = document.querySelector(".fileForm");
let fileInput = document.getElementById("formFile");
let modelResponse = document.getElementById("modelResponse");
let transmitting = document.getElementById("transmitting");
let fileTransmitText = document.getElementById("fileTransmitText");
let onlineCaptureText = document.getElementById("onlineCaptureText");

transmitting.addEventListener('click', () => {
  document.getElementById('video').srcObject = null;
  state = DEVICE;
  render();
  //closeConnection();
});

btnradio1.addEventListener('click', () => {    
  fileTransmit.hidden = true;
  onlineCapture.hidden = false;
});

btnradio2.addEventListener('click', () => {
  fileTransmit.hidden = false;
  onlineCapture.hidden = true;
});

fileInputForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  let formData = new FormData(fileInputForm);
  let data = await axios.post('http://100.73.222.28:8000/upload/', formData);
  let res = await axios.get('http://100.73.222.28:8000/translation/' + data.data.res);
  fileTransmitText.textContent = res.data.message;
});

const render = () => {
    for (const el of ['initializing', 'device', 'transmitting', 'error']) {
        document.getElementById(el).style.display = 'none';
    }

    switch (state) {
    case DEVICE:
        document.getElementById('device').style.display = 'flex';
        break;

    case TRANSMITTING:
        document.getElementById('transmitting').style.display = 'block';
        break;

    case ERROR:
        document.getElementById('error').style.display = 'flex';
        document.getElementById('error-message').innerHTML = 'error: ' + errorMessage;
        break;
    }
};

const restartPause = 2000;

const unquoteCredential = (v) => (
    JSON.parse(`"${v}"`)
);

const linkToIceServers = (links) => (
    (links !== null) ? links.split(', ').map((link) => {
        const m = link.match(/^<(.+?)>; rel="ice-server"(; username="(.*?)"; credential="(.*?)"; credential-type="password")?/i);
        const ret = {
            urls: [m[1]],
        };

        if (m[3] !== undefined) {
            ret.username = unquoteCredential(m[3]);
            ret.credential = unquoteCredential(m[4]);
            ret.credentialType = "password";
        }

        return ret;
    }) : []
);

const parseOffer = (offer) => {
    const ret = {
        iceUfrag: '',
        icePwd: '',
        medias: [],
    };

    for (const line of offer.split('\r\n')) {
        if (line.startsWith('m=')) {
            ret.medias.push(line.slice('m='.length));
        } else if (ret.iceUfrag === '' && line.startsWith('a=ice-ufrag:')) {
            ret.iceUfrag = line.slice('a=ice-ufrag:'.length);
        } else if (ret.icePwd === '' && line.startsWith('a=ice-pwd:')) {
            ret.icePwd = line.slice('a=ice-pwd:'.length);
        }
    }

    return ret;
};

const generateSdpFragment = (offerData, candidates) => {
    const candidatesByMedia = {};
    for (const candidate of candidates) {
        const mid = candidate.sdpMLineIndex;
        if (candidatesByMedia[mid] === undefined) {
            candidatesByMedia[mid] = [];
        }
        candidatesByMedia[mid].push(candidate);
    }

    let frag = 'a=ice-ufrag:' + offerData.iceUfrag + '\r\n'
        + 'a=ice-pwd:' + offerData.icePwd + '\r\n';

    let mid = 0;

    for (const media of offerData.medias) {
        if (candidatesByMedia[mid] !== undefined) {
            frag += 'm=' + media + '\r\n'
                + 'a=mid:' + mid + '\r\n';

            for (const candidate of candidatesByMedia[mid]) {
                frag += 'a=' + candidate.candidate + '\r\n';
            }
        }
        mid++;
    }

    return frag;
};

const setCodec = (section, codec) => {
    const lines = section.split('\r\n');
    const lines2 = [];
    const payloadFormats = [];

    for (const line of lines) {
        if (!line.startsWith('a=rtpmap:')) {
            lines2.push(line);
        } else {
            if (line.toLowerCase().includes(codec)) {
                payloadFormats.push(line.slice('a=rtpmap:'.length).split(' ')[0]);
                lines2.push(line);
            }
        }
    }

    const lines3 = [];

    for (const line of lines2) {
        if (line.startsWith('a=fmtp:')) {
            if (payloadFormats.includes(line.slice('a=fmtp:'.length).split(' ')[0])) {
                lines3.push(line);
            }
        } else if (line.startsWith('a=rtcp-fb:')) {
            if (payloadFormats.includes(line.slice('a=rtcp-fb:'.length).split(' ')[0])) {
                lines3.push(line);
            }
        } else {
            lines3.push(line);
        }
    }

    return lines3.join('\r\n');
};

const setVideoBitrate = (section, bitrate) => {
    let lines = section.split('\r\n');

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('c=')) {
            lines = [...lines.slice(0, i+1), 'b=TIAS:' + (parseInt(bitrate) * 1024).toString(), ...lines.slice(i+1)];
            break
        }
    }

    return lines.join('\r\n');
};

const setAudioBitrate = (section, bitrate, voice) => {
    let opusPayloadFormat = '';
    let lines = section.split('\r\n');

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('a=rtpmap:') && lines[i].toLowerCase().includes('opus/')) {
            opusPayloadFormat = lines[i].slice('a=rtpmap:'.length).split(' ')[0];
            break;
        }
    }

    if (opusPayloadFormat === '') {
        return section;
    }

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('a=fmtp:' + opusPayloadFormat + ' ')) {
            if (voice) {
                lines[i] = 'a=fmtp:' + opusPayloadFormat + ' minptime=10;useinbandfec=1;maxaveragebitrate='
                    + (parseInt(bitrate) * 1024).toString();
            } else {
                lines[i] = 'a=fmtp:' + opusPayloadFormat + ' maxplaybackrate=48000;stereo=1;sprop-stereo=1;maxaveragebitrate'
                    + (parseInt(bitrate) * 1024).toString();
            }
        }
    }

    return lines.join('\r\n');
};

const editAnswer = (answer, videoCodec, audioCodec, videoBitrate, audioBitrate, audioVoice) => {
    const sections = answer.split('m=');

    for (let i = 0; i < sections.length; i++) {
        const section = sections[i];
        if (section.startsWith('video')) {
            sections[i] = setVideoBitrate(setCodec(section, videoCodec), videoBitrate);
        } else if (section.startsWith('audio')) {
            sections[i] = setAudioBitrate(setCodec(section, audioCodec), audioBitrate, audioVoice);
        }
    }

    return sections.join('m=');
};

class Transmitter {
    constructor(stream) {
        this.stream = stream;
    this.pc = null;
    this.restartTimeout = null;
        this.eTag = '';
        this.queuedCandidates = [];
    this.start();
    }

    start() {
        console.log("requesting ICE servers");

        fetch("http://100.73.198.34:8889/mystream/whip", {
            method: 'OPTIONS',
        })
            .then((res) => { 
              this.onIceServers(res);
              let webSocket = new WebSocket("ws://100.73.198.34:9000");
              webSocket.onmessage = (event) => {
                onlineCaptureText.textContent = onlineCaptureText.textContent + " " + event.data;
              };
            })
            .catch((err) => {
                console.log('error: ' + err);
                this.scheduleRestart();
            });
    }

    onIceServers(res) {
        this.pc = new RTCPeerConnection({
            iceServers: linkToIceServers(res.headers.get('Link')),
        });

        this.pc.onicecandidate = (evt) => this.onLocalCandidate(evt);
        this.pc.oniceconnectionstatechange = () => this.onConnectionState();

        this.stream.getTracks().forEach((track) => {
            this.pc.addTrack(track, this.stream);
        });

        this.pc.createOffer()
            .then((offer) => this.onLocalOffer(offer));
    }

    onLocalOffer(offer) {
        this.offerData = parseOffer(offer.sdp);
        this.pc.setLocalDescription(offer);

        console.log("sending offer");

        fetch("http://100.73.198.34:8889/mystream/whip", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/sdp',
            },
            body: offer.sdp,
        })
            .then((res) => {
                if (res.status !== 201) {
                    throw new Error('bad status code');
                }
                this.eTag = res.headers.get('E-Tag');
                return res.text();
            })
            .then((sdp) => this.onRemoteAnswer(new RTCSessionDescription({
                type: 'answer',
                sdp,
            })))
            .catch((err) => {
                console.log('error: ' + err);
                this.scheduleRestart();
            });
    }

    onConnectionState() {
        if (this.restartTimeout !== null) {
            return;
        }

        console.log("peer connection state:", this.pc.iceConnectionState);

        switch (this.pc.iceConnectionState) {
        case "disconnected":
            this.scheduleRestart();
        }
    }

    onRemoteAnswer(answer) {
    if (this.restartTimeout !== null) {
      return;
    }

        answer = new RTCSessionDescription({
            type: 'answer',
            sdp: editAnswer(
                answer.sdp,
                document.getElementById('video_codec').value,
                document.getElementById('audio_codec').value,
                document.getElementById('video_bitrate').value,
                document.getElementById('audio_bitrate').value,
                document.getElementById('audio_voice').value,
            ),
        });

        this.pc.setRemoteDescription(new RTCSessionDescription(answer));

        if (this.queuedCandidates.length !== 0) {
            this.sendLocalCandidates(this.queuedCandidates);
            this.queuedCandidates = [];
        }
  }

    onLocalCandidate(evt) {
        if (this.restartTimeout !== null) {
            return;
        }

        if (evt.candidate !== null) {
            if (this.eTag === '') {
                this.queuedCandidates.push(evt.candidate);
            } else {
                this.sendLocalCandidates([evt.candidate])
            }
        }
    }

    sendLocalCandidates(candidates) {
        fetch("http://100.73.198.34:8889/mystream/whip", {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/trickle-ice-sdpfrag',
                'If-Match': this.eTag,
            },
            body: generateSdpFragment(this.offerData, candidates),
        })
            .then((res) => {
                if (res.status !== 204) {
                    throw new Error('bad status code');
                }
            })
            .catch((err) => {
                console.log('error: ' + err);
                this.scheduleRestart();
            });
    }

    scheduleRestart() {
        if (this.restartTimeout !== null) {
            return;
        }

        if (this.pc !== null) {
            this.pc.close();
            this.pc = null;
        }

        this.restartTimeout = window.setTimeout(() => {
            this.restartTimeout = null;
            this.start();
        }, restartPause);

        this.eTag = '';
        this.queuedCandidates = [];
    }

    closeConnection() {
      if (this.pc !== null) {
        this.pc.close();
        this.pc = null;
      }
    }
}

const onTransmit = (stream) => {
    state = TRANSMITTING;
    render();
    document.getElementById('video').srcObject = stream;
    new Transmitter(stream);
};

const onPublish = () => {
    const videoId = document.getElementById('video_device').value;
    const audioId = document.getElementById('audio_device').value;

    if (videoId !== 'screen') {
        let video = false;
        if (videoId !== 'none') {
            video = {
                deviceId: videoId,
            };
        }

        let audio = false;

        if (audioId !== 'none') {
            audio = {
                deviceId: audioId,
            };

            const voice = document.getElementById('audio_voice').checked;
            if (!voice) {
                audio.autoGainControl = false;
                audio.echoCancellation = false;
                audio.noiseSuppression = false;
            }
        }

        navigator.mediaDevices.getUserMedia({ video, audio })
            .then(onTransmit);
    } else {
        navigator.mediaDevices.getDisplayMedia({
            video: {
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                frameRate: { ideal: 30 },
                cursor: "always",
            },
            audio: false,
        })
            .then(onTransmit);
    }
};

const populateDevices = () => {
    return navigator.mediaDevices.enumerateDevices()
        .then((devices) => {
            for (const device of devices) {
                switch (device.kind) {
                case 'videoinput':
                    {
                        const opt = document.createElement('option');
                        opt.value = device.deviceId;
                        opt.text = device.label;
                        document.getElementById('video_device').appendChild(opt);
                    }
                    break;

                case 'audioinput':
                    {
                        const opt = document.createElement('option');
                        opt.value = device.deviceId;
                        opt.text = device.label;
                        document.getElementById('audio_device').appendChild(opt);
                    }
                    break;
                }
            }

            // add screen
            const opt = document.createElement('option');
            opt.value = "screen";
            opt.text = "screen";
            document.getElementById('video_device').appendChild(opt);

            // set default
            document.getElementById('video_device').value = document.getElementById('video_device').children[1].value;
            if (document.getElementById('audio_device').children.length > 1) {
                document.getElementById('audio_device').value = document.getElementById('audio_device').children[1].value;
            }
        });
};

const populateCodecs = () => {
    const pc = new RTCPeerConnection({});
    pc.addTransceiver("video", { direction: 'sendonly' });
    pc.addTransceiver("audio", { direction: 'sendonly' });

    return pc.createOffer()
        .then((desc) => {
            const sdp = desc.sdp.toLowerCase();

            for (const codec of ['h264/90000', 'av1/90000', 'vp9/90000', 'vp8/90000']) {
                if (sdp.includes(codec)) {
                    const opt = document.createElement('option');
                    opt.value = codec;
                    opt.text = codec.split('/')[0].toUpperCase();
                    document.getElementById('video_codec').appendChild(opt);
                }
            }

            for (const codec of ['opus/48000', 'g722/8000', 'pcmu/8000', 'pcma/8000']) {
                if (sdp.includes(codec)) {
                    const opt = document.createElement('option');
                    opt.value = codec;
                    opt.text = codec.split('/')[0].toUpperCase();
                    document.getElementById('audio_codec').appendChild(opt);
                }
            }

            pc.close();
        });
};

const initialize = () => {
    if (navigator.mediaDevices === undefined) {
        state = ERROR;
        errorMessage = 'can\'t access webcams or microphones. Make sure that WebRTC encryption is enabled.';
        render();
        return;
    }

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(() => Promise.all([
            populateDevices(),
            populateCodecs(),
        ]))
        .then(() => {
            state = DEVICE;
            render();
        })
        .catch((err) => {
            state = ERROR;
            errorMessage = err.toString();
            render();
        });

        fileTransmit.hidden = true;
        onlineCapture.hidden = false;
};

document.getElementById("publish_confirm").addEventListener('click', onPublish);

initialize();