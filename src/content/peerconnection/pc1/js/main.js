/*
 *  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

'use strict';

const startButton = document.getElementById('startButton');
const callButton = document.getElementById('callButton');
const hangupButton = document.getElementById('hangupButton');
const logOut = document.getElementById('logOut');
callButton.disabled = true;
hangupButton.disabled = true;
startButton.addEventListener('click', start);
callButton.addEventListener('click', call);
hangupButton.addEventListener('click', hangup);

let startTime;
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

localVideo.addEventListener('loadedmetadata', function () {
    log(`Local video videoWidth: ${this.videoWidth}px,  videoHeight: ${this.videoHeight}px`);
});

remoteVideo.addEventListener('loadedmetadata', function () {
    log(`Remote video videoWidth: ${this.videoWidth}px,  videoHeight: ${this.videoHeight}px`);
});

remoteVideo.addEventListener('resize', () => {
    log(`Remote video size changed to ${remoteVideo.videoWidth}x${remoteVideo.videoHeight} - Time since pageload ${performance.now().toFixed(0)}ms`);
    // We'll use the first onsize callback as an indication that video has started
    // playing out.
    if (startTime) {
        const elapsedTime = window.performance.now() - startTime;
        log('Setup time: ' + elapsedTime.toFixed(3) + 'ms');
        startTime = null;
    }
});

let localStream;
let pc1;
let pc2;
const offerOptions = {
    offerToReceiveAudio: 1,
    offerToReceiveVideo: 1,
};

function getName(pc) {
    return pc === pc1 ? 'pc1' : 'pc2';
}

function getOtherPc(pc) {
    return pc === pc1 ? pc2 : pc1;
}

async function start() {
    log('Requesting local stream');
    log(navigator.userAgent);
    startButton.disabled = true;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        log('Received local stream');
        localVideo.srcObject = stream;
        localStream = stream;
        callButton.disabled = false;
    } catch (e) {
        log(`getUserMedia() error: ${e.name}`);
    }
}

async function call() {
    callButton.disabled = true;
    hangupButton.disabled = false;
    log('Starting call');
    startTime = window.performance.now();
    const videoTracks = localStream.getVideoTracks();
    const audioTracks = localStream.getAudioTracks();
    if (videoTracks.length > 0) {
        log(`Using video device: ${videoTracks[0].label}`);
    }
    if (audioTracks.length > 0) {
        log(`Using audio device: ${audioTracks[0].label}`);
    }

    try {
        const configuration = {};
        log('RTCPeerConnection configuration:', configuration);
        pc1 = new RTCPeerConnection(configuration);
        log('Created local peer connection object pc1');
        pc1.addEventListener('icecandidate', (e) => onIceCandidate(pc1, e));
        pc2 = new RTCPeerConnection(configuration);
        log('Created remote peer connection object pc2');
        pc2.addEventListener('icecandidate', (e) => onIceCandidate(pc2, e));
        pc1.addEventListener('iceconnectionstatechange', (e) => onIceStateChange(pc1, e));
        pc2.addEventListener('iceconnectionstatechange', (e) => onIceStateChange(pc2, e));
        pc2.addEventListener('track', gotRemoteStream);

        localStream.getTracks().forEach((track) => pc1.addTrack(track, localStream));
        log('Added local stream to pc1');
    } catch (e) {
        log(e);
    }

    try {
        log('pc1 createOffer start');
        const offer = await pc1.createOffer(offerOptions);
        await onCreateOfferSuccess(offer);
    } catch (e) {
        onCreateSessionDescriptionError(e);
    }
}

function onCreateSessionDescriptionError(error) {
    log(`Failed to create session description: ${error.toString()}`);
}

async function onCreateOfferSuccess(desc) {
    log(`Offer from pc1\n${desc.sdp}`);
    log('pc1 setLocalDescription start');
    try {
        await pc1.setLocalDescription(desc);
        onSetLocalSuccess(pc1);
    } catch (e) {
        onSetSessionDescriptionError();
    }

    log('pc2 setRemoteDescription start');
    try {
        await pc2.setRemoteDescription(desc);
        onSetRemoteSuccess(pc2);
    } catch (e) {
        onSetSessionDescriptionError();
    }

    log('pc2 createAnswer start');
    // Since the 'remote' side has no media stream we need
    // to pass in the right constraints in order for it to
    // accept the incoming offer of audio and video.
    try {
        const answer = await pc2.createAnswer();
        await onCreateAnswerSuccess(answer);
    } catch (e) {
        onCreateSessionDescriptionError(e);
    }
}

function onSetLocalSuccess(pc) {
    log(`${getName(pc)} setLocalDescription complete`);
}

function onSetRemoteSuccess(pc) {
    log(`${getName(pc)} setRemoteDescription complete`);
}

function onSetSessionDescriptionError(error) {
    log(`Failed to set session description: ${error.toString()}`);
}

function gotRemoteStream(e) {
    if (remoteVideo.srcObject !== e.streams[0]) {
        remoteVideo.srcObject = e.streams[0];
        log('pc2 received remote stream');
    }
}

async function onCreateAnswerSuccess(desc) {
    log(`Answer from pc2:\n${desc.sdp}`);
    log('pc2 setLocalDescription start');
    try {
        await pc2.setLocalDescription(desc);
        onSetLocalSuccess(pc2);
    } catch (e) {
        onSetSessionDescriptionError(e);
    }
    log('pc1 setRemoteDescription start');
    try {
        await pc1.setRemoteDescription(desc);
        onSetRemoteSuccess(pc1);
    } catch (e) {
        onSetSessionDescriptionError(e);
    }
}

async function onIceCandidate(pc, event) {
    try {
        await getOtherPc(pc).addIceCandidate(event.candidate);
        onAddIceCandidateSuccess(pc);
    } catch (e) {
        onAddIceCandidateError(pc, e);
    }
    log(`${getName(pc)} ICE candidate:\n${event.candidate ? event.candidate.candidate : '(null)'}`);
}

function onAddIceCandidateSuccess(pc) {
    log(`${getName(pc)} addIceCandidate success`);
}

function onAddIceCandidateError(pc, error) {
    log(`${getName(pc)} failed to add ICE Candidate: ${error.toString()}`);
}

function onIceStateChange(pc, event) {
    if (pc) {
        log(`${getName(pc)} ICE state: ${pc.iceConnectionState}`);
        log('ICE state change event: ', event);
    }
}

function hangup() {
    log('Ending call');
    pc1.close();
    pc2.close();
    pc1 = null;
    pc2 = null;
    hangupButton.disabled = true;
    callButton.disabled = false;
}

function log(text) {
    logOut.insertAdjacentHTML('beforeend', text + '<br/>=====================<br/>');
}
