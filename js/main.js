/*
 *  Copyright (c) 2021 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

"use strict";
localStorage.debug = "*";

const LOGGER = function logger() {
    console.log(...arguments);
};

const _ = {
    SEND: {
        JOIN: "room:join",
        I_WANT_TO_HANDSHAKE: "user:hand:shake",
        MAKE_CALL: "user:call",
        ACCEPT_CALL: "call:accept",
        DECLINE_CALL: "call:decline",
        NEGOTIATION_NEEDED: "peer:nego:needed",
        NEGOTIATION_DONE: "peer:nego:done",
        ICE_CANDIDATE: "send-ice-candidate",
    },
    RECEIVE: {
        SOMEONE_JOINED: "user:joined",
        PARTNER_HAND_SHAKED: "user:hand:shaked",
        PARTNER_CALLING: "call:incoming",
        CALL_ACCEPTED: "call:accepted",
        CALL_DECLINED: "call:declined",
        PARTNER_NEEDS_NEGOTIATION: "peer:nego:needed",
        PARTNER_ACCEPTED_NEGOTIATION: "peer:nego:final",
        ICE_CANDIDATE: "receive-ice-candidate",
    },
};

const ROOM_ID = "38";
const MY_NAME = String(Math.random()).slice(2, 10);

const signalingSocket = io("https://yunus-dev.uz/", {
    transports: ["websocket"],
});

const startButton = document.getElementById("startButton");
const hangupButton = document.getElementById("hangupButton");
const showLocalButton = document.getElementById("see_local_constants");
hangupButton.disabled = true;

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

let REMOTE_SOCKET_ID;
let REMOTE_OFFER_SDP;
let pc;
let localStream;

// ------------ INITIALIZE ------------
tryToGetLocalStream_InAdvance();

LOGGER("_.SEND.JOIN", { email: MY_NAME, room: ROOM_ID });
signalingSocket.emit(_.SEND.JOIN, {
    email: MY_NAME,
    room: ROOM_ID,
});

// ------------ EVENTS ------------
signalingSocket.on(_.RECEIVE.SOMEONE_JOINED, (data) => {
    LOGGER("_.RECEIVE.SOMEONE_JOINED", data);
    if (data.email !== MY_NAME) {
        REMOTE_SOCKET_ID = data.id;

        LOGGER("_.SEND.I_WANT_TO_HANDSHAKE", { to: data.id, room: ROOM_ID });
        signalingSocket.emit(_.SEND.I_WANT_TO_HANDSHAKE, {
            to: data.id,
            room: ROOM_ID,
        });
    }
});
signalingSocket.on(_.RECEIVE.PARTNER_HAND_SHAKED, (data) => {
    LOGGER("_.RECEIVE.PARTNER_HAND_SHAKED", data);
    if (ROOM_ID === data.room) {
        REMOTE_SOCKET_ID = data.from;
    }
});
signalingSocket.on(_.RECEIVE.ICE_CANDIDATE, async (data) => {
    LOGGER("_.RECEIVE.ICE_CANDIDATE", data);
    if (!pc) {
        console.error("no peerconnection");
        return;
    }
    if (!data.candidate) {
        await pc.addIceCandidate(null);
    } else {
        await pc.addIceCandidate(data);
    }
});
signalingSocket.on(_.RECEIVE.PARTNER_CALLING, (data) => {
    LOGGER("_.RECEIVE.PARTNER_CALLING", data);
    REMOTE_OFFER_SDP = data.offer;
    i_want_to_accept_call();
});
signalingSocket.on(_.RECEIVE.CALL_ACCEPTED, (data) => {
    LOGGER("_.RECEIVE.CALL_ACCEPTED", data);
    my_call_accepted_from_partner(data.answer);
});
// ------------------------------------------------------

const i_want_to_start_call = async () => {
    localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
    });
    localVideo.srcObject = localStream;

    startButton.disabled = true;
    hangupButton.disabled = false;

    if (pc) {
        console.log("already in call, ignoring");
        return;
    }

    await createPeerConnection();

    const offer = await pc.createOffer();
    LOGGER("_.SEND.MAKE_CALL", {
        to: REMOTE_SOCKET_ID,
        offer: offer,
        room: ROOM_ID,
    });
    signalingSocket.emit(_.SEND.MAKE_CALL, {
        to: REMOTE_SOCKET_ID,
        offer: offer,
        room: ROOM_ID,
    });
    await pc.setLocalDescription(offer);
};

const i_want_to_accept_call = async () => {
    if (pc) {
        console.error("existing peerconnection");
        return;
    }
    await createPeerConnection();
    await pc.setRemoteDescription(REMOTE_OFFER_SDP);

    const answer = await pc.createAnswer();

    LOGGER("_.SEND.ACCEPT_CALL", {
        to: REMOTE_SOCKET_ID,
        answer: answer,
        room: ROOM_ID,
    });
    signalingSocket.emit(_.SEND.ACCEPT_CALL, {
        to: REMOTE_SOCKET_ID,
        answer: answer,
        room: ROOM_ID,
    });
    await pc.setLocalDescription(answer);
};

const my_call_accepted_from_partner = async (answer) => {
    if (!pc) {
        console.error("no peerconnection");
        return;
    }
    await pc.setRemoteDescription(answer);
};

startButton.onclick = async () => {
    i_want_to_start_call();
};

hangupButton.onclick = async () => {
    hangup();
    signalingSocket.emit("message", { type: "bye" });
};

async function hangup() {
    if (pc) {
        pc.close();
        pc = null;
    }
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
    startButton.disabled = false;
    hangupButton.disabled = true;
}

function createPeerConnection() {
    pc = new RTCPeerConnection({
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
        ],
    });
    pc.onicecandidate = (e) => {
        const data = {
            candidate: null,
        };
        if (e.candidate) {
            data.candidate = e.candidate.candidate;
            data.sdpMid = e.candidate.sdpMid;
            data.sdpMLineIndex = e.candidate.sdpMLineIndex;
        }
        LOGGER("_.SEND.ICE_CANDIDATE", data);
        signalingSocket.emit(_.SEND.ICE_CANDIDATE, data);
    };
    pc.ontrack = (e) => {
        LOGGER("getting remote stream tracks", e);
        remoteVideo.srcObject = e.streams[0];
    };
    localStream.getTracks().forEach((track) => {
        LOGGER("adding track to my stream");
        pc.addTrack(track, localStream);
    });
}

async function makeCall() {}

async function tryToGetLocalStream_InAdvance() {
    localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
    });
    localVideo.srcObject = localStream;
}

showLocalButton.onclick = () => {
    LOGGER("LOCAL_CONSTANTS", {
        pc: pc,
        localStream,
        remoteVideo,
        REMOTE_SOCKET_ID,
        REMOTE_OFFER_SDP,
        ROOM_ID,
        MY_NAME,
    });
};
