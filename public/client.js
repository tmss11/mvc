"use strict";   // おまじない
const g_elementDivJoinScreen = document.getElementById( "djs" );
const g_elementDivChatScreen = document.getElementById( "dcs" );
const g_elementInputUserName = document.getElementById( "username" );
const g_elementInputRoomName = document.getElementById( "roomname" );
const g_elementCheckboxCamera = document.getElementById( "camera" );
const g_elementCheckboxMicrophone = document.getElementById( "mic" );
const g_elementTextRoomName = document.getElementById( "troomname" );
const g_elementDivUserInfo = document.getElementById( "userinfo" );
const g_elementTextUserName = document.getElementById( "tusername" );
const g_elementVideoLocal = document.getElementById( "videolocal" );
const g_elementTextMessageForSend = document.getElementById( "tsend" );
const g_elementTextareaMessageReceived = document.getElementById( "received" );
let g_mapRtcPeerConnection = new Map();
const g_socket = io.connect();

window.addEventListener(
    "beforeunload",( event ) =>{
        event.preventDefault(); 
        onclickButton_LeaveChat();        
        g_socket.disconnect();   
        e.returnValue = ""; 
        return "";
    } );

function onsubmitButton_Join(){
    let strInputUserName = g_elementInputUserName.value;
    console.log( "- User name :", strInputUserName );
    if( !strInputUserName ){
        return;
    }
    g_elementTextUserName.value = strInputUserName;
    let strRoomName = g_elementInputRoomName.value;
    g_elementTextRoomName.value = strRoomName;
    console.log( "- Send 'Join' to server" );
    g_socket.emit( "join", { roomname: strRoomName } );
    g_elementDivJoinScreen.style.display = "none";  
    g_elementDivChatScreen.style.display = "block";
}

function onclickCheckbox_CameraMicrophone(){
    let trackCamera_old = null;
    let trackMicrophone_old = null;
    let bCamera_old = false;
    let bMicrophone_old = false;
    let idCameraTrack_old = "";
    let idMicrophoneTrack_old = "";
    let stream = g_elementVideoLocal.srcObject;
    if( stream ){
        trackCamera_old = stream.getVideoTracks()[0];
        if( trackCamera_old ){
            bCamera_old = true;
            idCameraTrack_old = trackCamera_old.id;
        }
        trackMicrophone_old = stream.getAudioTracks()[0];
        if( trackMicrophone_old ){
            bMicrophone_old = true;
            idMicrophoneTrack_old = trackMicrophone_old.id;
        }
    }
    let bCamera_new = false;
    if( g_elementCheckboxCamera.checked ){
        bCamera_new = true;
    }
    let bMicrophone_new = false;
    if( g_elementCheckboxMicrophone.checked ){
        bMicrophone_new = true;
    }
    if( bCamera_old === bCamera_new && bMicrophone_old === bMicrophone_new ){
        return;
    }
    g_mapRtcPeerConnection.forEach( ( rtcPeerConnection ) => {
        let senders = rtcPeerConnection.getSenders();
        senders.forEach( ( sender ) =>{
            if( sender.track ){
                if( idCameraTrack_old === sender.track.id
                    || idMicrophoneTrack_old === sender.track.id){
                    rtcPeerConnection.removeTrack( sender );
                }
            }
        } );
    } );

    if( trackCamera_old ){
        trackCamera_old.stop();
    }
    if( trackMicrophone_old ){
        trackMicrophone_old.stop();
    }
    setStreamToElement( g_elementVideoLocal, null );

    if( !bCamera_new && !bMicrophone_new ){
        return;
    }
    navigator.mediaDevices.getUserMedia( { video: bCamera_new, audio: bMicrophone_new } ).then( ( stream ) =>{
            g_mapRtcPeerConnection.forEach( ( rtcPeerConnection ) => {
                stream.getTracks().forEach( ( track ) =>{
                    rtcPeerConnection.addTrack( track, stream );
                } );
            } );
            setStreamToElement( g_elementVideoLocal, stream );
        } ).catch( ( error ) =>{
            alert( "カメラがスタートできない" );
            g_elementCheckboxCamera.checked = false;
            g_elementCheckboxMicrophone.checked = false;
            return;
        } );
}
function onsubmitButton_SendMessage(){
    if( !g_mapRtcPeerConnection.size ){
        alert( "送る相手がいないよ" );
        return;
    }

    if( !g_elementTextMessageForSend.value ){
        alert( "メッセージを入れて" );
        return;
    }
    const g_elementTextUserName = document.getElementById( "tusername" );
    g_mapRtcPeerConnection.forEach( ( rtcPeerConnection ) =>{
        rtcPeerConnection.datachannel.send( JSON.stringify( { type: "message", data: g_elementTextUserName.value+g_elementTextMessageForSend.value } ) );
    } );
    g_elementTextareaMessageReceived.value = g_elementTextUserName.value+g_elementTextMessageForSend.value + "\n" + g_elementTextareaMessageReceived.value; // 一番上に追加
    g_elementTextMessageForSend.value = "";
}
function onclickButton_LeaveChat(){
    g_mapRtcPeerConnection.forEach( ( rtcPeerConnection ) =>{
        if( isDataChannelOpen( rtcPeerConnection ) ){
            rtcPeerConnection.datachannel.send( JSON.stringify( { type: "leave", data: "" } ) );
        }
        endPeerConnection( rtcPeerConnection );
    } );
    g_socket.emit( "leave", "" );
    g_elementTextUserName.value = "";
    g_elementDivChatScreen.style.display = "none";  
    g_elementDivJoinScreen.style.display = "flex";
}
//g_socket.on("connect",() =>{} );
g_socket.on("signaling",( objData ) =>{
        let strRemoteSocketID = objData.from;
        if( !g_elementTextUserName.value ){
            return;
        }
        if( "join" === objData.type )
        {
            if( g_mapRtcPeerConnection.get( strRemoteSocketID ) ){ 
                alert( "すでにコネクションしているよ" );
                return;
            }
            let rtcPeerConnection = createPeerConnection( g_elementVideoLocal.srcObject, strRemoteSocketID );
            g_mapRtcPeerConnection.set( strRemoteSocketID, rtcPeerConnection ); 
            let datachannel = rtcPeerConnection.createDataChannel( "datachannel" );
            rtcPeerConnection.datachannel = datachannel;
            setupDataChannelEventHandler( rtcPeerConnection );
            createOfferSDP( rtcPeerConnection );
        }
        else if( "offer" === objData.type ){
            if( g_mapRtcPeerConnection.get( strRemoteSocketID ) ){   // 既にコネクションオブジェクトあり
                alert( "だからコネクションあるって言ってんの" );
                return;
            }
            let rtcPeerConnection = createPeerConnection( g_elementVideoLocal.srcObject, strRemoteSocketID );
            g_mapRtcPeerConnection.set( strRemoteSocketID, rtcPeerConnection );   
            setOfferSDP_and_createAnswerSDP( rtcPeerConnection, objData.data );   
            appendRemoteInfoElement( strRemoteSocketID, objData.username );
        }
        else if( "answer" === objData.type ){
            let rtcPeerConnection = g_mapRtcPeerConnection.get( strRemoteSocketID );
            if( !rtcPeerConnection ){
                alert( "今度はコネクションないねこれ" );
                return;
            }
            setAnswerSDP( rtcPeerConnection, objData.data );  
            appendRemoteInfoElement( strRemoteSocketID, objData.username );
        }
        else if( "candidate" === objData.type ){
            let rtcPeerConnection = g_mapRtcPeerConnection.get( strRemoteSocketID );
            if( !rtcPeerConnection ){
                alert( "・・コネクションないって" );
                return;
            }
            addCandidate( rtcPeerConnection, objData.data );
        }else{
            console.error( "シグナリングできてない" );
        }
    } );
function setupDataChannelEventHandler( rtcPeerConnection ){
    if( !( "datachannel" in rtcPeerConnection ) ){
        console.error( "シグナリングできてない" );
        return;
    }
    rtcPeerConnection.datachannel.onmessage = ( event ) =>{
        let objData = JSON.parse( event.data );
        if( "message" === objData.type ){
            let strMessage = objData.data;
            g_elementTextareaMessageReceived.value = strMessage + "\n" + g_elementTextareaMessageReceived.value; 
        }
        else if( "offer" === objData.type ){
            setOfferSDP_and_createAnswerSDP( rtcPeerConnection, objData.data );
        }
        else if( "answer" === objData.type ){
            setAnswerSDP( rtcPeerConnection, objData.data );
        }
        else if( "candidate" === objData.type ){
            addCandidate( rtcPeerConnection, objData.data );
        }
        else if( "leave" === objData.type ){
            endPeerConnection( rtcPeerConnection );
        }
    }
}
function isDataChannelOpen( rtcPeerConnection ){
    if( !( "datachannel" in rtcPeerConnection ) ){
        return false;
    }
    if( !rtcPeerConnection.datachannel ){
        return false;
    }
    if( "open" !== rtcPeerConnection.datachannel.readyState ){
        return false;
    }
    return true;
}
function createPeerConnection( stream, strRemoteSocketID ){
    let config = {"iceServers": [
            { "urls": "stun:stun.l.google.com:19302" },
            { "urls": "stun:stun1.l.google.com:19302" },
            { "urls": "stun:stun2.l.google.com:19302" },
        ]
    };
    let rtcPeerConnection = new RTCPeerConnection( config );
    rtcPeerConnection.strRemoteSocketID = strRemoteSocketID;
    setupRTCPeerConnectionEventHandler( rtcPeerConnection );
    if( stream ){
        stream.getTracks().forEach( ( track ) =>{
            rtcPeerConnection.addTrack( track, stream );
        } );
    }else{
    }
    return rtcPeerConnection;
}
function endPeerConnection( rtcPeerConnection ){
    removeRemoteInfoElement( rtcPeerConnection.strRemoteSocketID );
    if( "datachannel" in rtcPeerConnection ){
        rtcPeerConnection.datachannel.close();
        rtcPeerConnection.datachannel = null;
    }
    g_mapRtcPeerConnection.delete( rtcPeerConnection.strRemoteSocketID );
    rtcPeerConnection.close();
}

function setupRTCPeerConnectionEventHandler( rtcPeerConnection ){
    rtcPeerConnection.onnegotiationneeded = () =>{
        if( !isDataChannelOpen( rtcPeerConnection ) ){
        }else{
            createOfferSDP( rtcPeerConnection );
        }
    };
    rtcPeerConnection.onicecandidate = ( event ) =>{
        if( event.candidate ){
            if( !isDataChannelOpen( rtcPeerConnection ) ){
                g_socket.emit( "signaling", { to: rtcPeerConnection.strRemoteSocketID, type: "candidate", data: event.candidate } );
            }else{
                rtcPeerConnection.datachannel.send( JSON.stringify( { type: "candidate", data: event.candidate } ) );
            }
        }else{
        }
    };
    rtcPeerConnection.onicecandidateerror = ( event ) =>{
        console.error(event.errorCode );
    };
    // rtcPeerConnection.onicegatheringstatechange = () =>{
    //     if( "complete" === rtcPeerConnection.iceGatheringState )
    //     {
    //         // Vanilla ICEの場合は、ICE candidateを含んだOfferSDP/AnswerSDPを相手に送る
    //         // Trickle ICEの場合は、何もしない
            
    //         if( "offer" === rtcPeerConnection.localDescription.type )
    //         {
    //             // OfferSDPをサーバーに送信
    //             //console.log( "- Send OfferSDP to server" );
    //             //g_socket.emit( "signaling", { type: "offer", data: rtcPeerConnection.localDescription } );
    //         }
    //         else if( "answer" === rtcPeerConnection.localDescription.type )
    //         {
    //             // AnswerSDPをサーバーに送信
    //             //console.log( "- Send AnswerSDP to server" );
    //             //g_socket.emit( "signaling", { type: "answer", data: rtcPeerConnection.localDescription } );
    //         }
    //         else
    //         {
    //             console.error( "Unexpected : Unknown localDescription.type. type = ", rtcPeerConnection.localDescription.type );
    //         }
    //     }
    // };
    // rtcPeerConnection.oniceconnectionstatechange = () =>{
    // }
    // rtcPeerConnection.onsignalingstatechange = () =>{};
    rtcPeerConnection.onconnectionstatechange = () =>{
        if( "failed" === rtcPeerConnection.connectionState ){
            endPeerConnection( rtcPeerConnection );
        }
    };
    rtcPeerConnection.ontrack = ( event ) =>{
        let stream = event.streams[0];
        let track = event.track;
        if( "video" === track.kind ){
            let elementVideoRemote = getRemoteVideoElement( rtcPeerConnection.strRemoteSocketID );
            setStreamToElement( elementVideoRemote, stream );
        }else if( "audio" === track.kind ){
            let elementAudioRemote = getRemoteAudioElement( rtcPeerConnection.strRemoteSocketID );
            setStreamToElement( elementAudioRemote, stream );
        }else{
            console.error( "Unexpected : Unknown track kind : ", track.kind );
        }
        stream.onremovetrack = ( evt ) =>{
            let trackRemove = evt.track;
            if( "video" === trackRemove.kind ){
                let elementVideoRemote = getRemoteVideoElement( rtcPeerConnection.strRemoteSocketID );
                setStreamToElement( elementVideoRemote, null );
            }else if( "audio" === trackRemove.kind ){
                let elementAudioRemote = getRemoteAudioElement( rtcPeerConnection.strRemoteSocketID );
                setStreamToElement( elementAudioRemote, null );
            }else{
                console.error(trackRemove.kind );
            }
        };
    };
    rtcPeerConnection.ondatachannel = ( event ) =>{
        rtcPeerConnection.datachannel = event.channel;
        setupDataChannelEventHandler( rtcPeerConnection );
        createOfferSDP( rtcPeerConnection );
    };
}
function createOfferSDP( rtcPeerConnection ){
    rtcPeerConnection.createOffer().then( ( sessionDescription ) =>{
            return rtcPeerConnection.setLocalDescription( sessionDescription );
        } ).then( () =>{
            if( !isDataChannelOpen( rtcPeerConnection ) ){
                g_socket.emit( "signaling", { to: rtcPeerConnection.strRemoteSocketID, type: "offer",data: rtcPeerConnection.localDescription, username: g_elementTextUserName.value } );
            }else{
                rtcPeerConnection.datachannel.send( JSON.stringify( { type: "offer", data: rtcPeerConnection.localDescription } ) );
            }
        } ).catch( ( error ) =>{
            console.error( "Error : ", error );
        } );
}
function setOfferSDP_and_createAnswerSDP( rtcPeerConnection, sessionDescription ){
    rtcPeerConnection.setRemoteDescription( sessionDescription ).then( () =>{
            return rtcPeerConnection.createAnswer();
        } ).then( ( sessionDescription ) =>{
            return rtcPeerConnection.setLocalDescription( sessionDescription );
        } ).then( () =>{
            if( !isDataChannelOpen( rtcPeerConnection ) ){ 
                g_socket.emit( "signaling", { to: rtcPeerConnection.strRemoteSocketID, type: "answer",data: rtcPeerConnection.localDescription, username: g_elementTextUserName.value } );
            }else{ 
                rtcPeerConnection.datachannel.send( JSON.stringify( { type: "answer", data: rtcPeerConnection.localDescription } ) );
            }
        } ).catch( ( error ) =>{
            console.error( "Error : ", error );
        } );
}
function setAnswerSDP( rtcPeerConnection, sessionDescription ){
    rtcPeerConnection.setRemoteDescription( sessionDescription ).catch( ( error ) =>{
            console.error( "Error : ", error );
        } );
}

function addCandidate( rtcPeerConnection, candidate ){
    rtcPeerConnection.addIceCandidate( candidate ).catch( ( error ) =>{
            console.error( "Error : ", error );
        } );
}

function setStreamToElement( elementMedia, stream ){
    elementMedia.srcObject = stream;
    if( !stream ){ 
        return;
    }
    if( "VIDEO" === elementMedia.tagName ){
        elementMedia.volume = 0.0;
        elementMedia.muted = true;
    }else if( "AUDIO" === elementMedia.tagName ){
        elementMedia.volume = 1.0;
        elementMedia.muted = false;
    }else{
        console.error(elementMedia.tagName );
    }
}
function appendRemoteInfoElement( strRemoteSocketID, strUserName ){
    let strElementTextID = "text_" + strRemoteSocketID;
    let strElementVideoID = "video_" + strRemoteSocketID;
    let strElementAudioID = "audio_" + strRemoteSocketID;
    let strElementTableID = "table_" + strRemoteSocketID;
    let elementText = document.createElement( "input" );
    elementText.id = strElementTextID;
    elementText.type = "text";
    elementText.readOnly = "readonly";
    elementText.value = strUserName;
    let elementVideo = document.createElement( "video" );
    elementVideo.id = strElementVideoID;
    elementVideo.width = "320";
    elementVideo.height = "240";
    elementVideo.style.border = "1px solid black";
    elementVideo.autoplay = true;
    let elementAudio = document.createElement( "audio" );
    elementAudio.id = strElementAudioID;
    elementAudio.autoplay = true;
    let elementDiv = document.createElement( "div" );
    elementDiv.id = strElementTableID;
    elementDiv.border = "1px solid black";
    elementDiv.appendChild( elementText );    
    elementDiv.appendChild( document.createElement( "br" ) ); 
    elementDiv.appendChild( elementVideo );   
    elementDiv.appendChild( elementAudio );
    g_elementDivUserInfo.appendChild( elementDiv );
}
function getRemoteVideoElement( strRemoteSocketID ){
    let strElementVideoID = "video_" + strRemoteSocketID;
    return document.getElementById( strElementVideoID );
}

function getRemoteAudioElement( strRemoteSocketID ){
    let strElementAudioID = "audio_" + strRemoteSocketID;
    return document.getElementById( strElementAudioID );
}

function removeRemoteInfoElement( strRemoteSocketID ){
    let strElementTableID = "table_" + strRemoteSocketID;
    let elementTable = document.getElementById( strElementTableID );
    if( !elementTable ){
        console.error(strRemoteSocketID );
    }
    g_elementDivUserInfo.removeChild( elementTable );
}
