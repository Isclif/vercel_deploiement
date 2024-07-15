var WrtcHelper = (function () {
  // Configuration ICE pour les serveurs de connexion 
  const iceConfiguration = {
    iceServers: [
      {
        urls: "stun:stun.l.google.com:19302",
      },
      {
        urls: "stun:stun1.l.google.com:19302",
      },
      {
        urls: "stun:stun2.l.google.com:19302",
      },
      {
        urls: "stun:stun3.l.google.com:19302",
      },
      {
        urls: "stun:stun4.l.google.com:19302",
      },
    ],
  };

  var _audioTrack; // Piste audio locale

  var peers_conns = []; // Tableau des connexions avec d'autres participants
  var peers_con_ids = []; // Tableau des IDs de connexion des participants

  var _remoteVideoStreams = []; // Flux vidéo reçus des autres participants
  var _remoteAudioStreams = []; // Flux audio reçus des autres participants

  var _localVideoPlayer; // Élément vidéo pour afficher la vidéo locale

  var _rtpVideoSenders = []; // Tableau des expéditeurs RTP pour la vidéo
  var _rtpAudioSenders = []; // Tableau des expéditeurs RTP pour l'audio

  var _serverFn; // Fonction de communication avec le serveur

  // États possibles de la vidéo (Aucune, Caméra, Partage d'écran)
  var VideoStates = {
    None: 0,
    Camera: 1,
    ScreenShare: 2,
  };
  var _videoState = VideoStates.None; // État actuel de la vidéo
  var _videoCamSSTrack; // Piste vidéo actuellement utilisée

  var _isAudioMute = true; // État actuel de la coupure audio (muet ou non)
  var _my_connid = ""; // ID de connexion de l'utilisateur local



  // Initialisation de l'objet avec la fonction serveur et l'ID de connexion local
  async function _init(serverFn, myconnid) {
    _my_connid = myconnid;
    _serverFn = serverFn;
    _localVideoPlayer = document.getElementById("localVideoCtr"); // Élément vidéo locale

    eventBinding(); // Lier les événements des boutons d'interface utilisateur
  }

  // Lier les événements des boutons d'interface utilisateur
  function eventBinding() {
    $("#btnMuteUnmute").on("click", async function () {
      // Gestion du bouton de coupure audio
      if (!_audioTrack) {
        await startwithAudio(); // Commencer avec l'audio si ce n'est pas déjà fait
      }

      if (!_audioTrack) {
        alert("Problème avec la permission audio");
        return;
      }

      if (_isAudioMute) {
        _audioTrack.enabled = true;
        $(this).html('<span class="material-icons">mic</span>'); // Activer le microphone
        AddUpdateAudioVideoSenders(_audioTrack, _rtpAudioSenders); // Ajouter ou mettre à jour les expéditeurs audio
      } else {
        _audioTrack.enabled = false;
        $(this).html('<span class="material-icons">mic_off</span>'); // Désactiver le microphone

        RemoveAudioVideoSenders(_rtpAudioSenders); // Supprimer les expéditeurs audio
      }
      _isAudioMute = !_isAudioMute; // Inverser l'état de la coupure audio

      console.log(_audioTrack);
    });

    

    $("#btnStartStopCam").on("click", async function () {
      // Gestion du bouton de démarrage/arrêt de la caméra
      if (_videoState == VideoStates.Camera) {
        await ManageVideo(VideoStates.None); // Cas d'arrêt
      } else {
        await ManageVideo(VideoStates.Camera); // Commencer la vidéo depuis la caméra
      }
    });

    $("#btnStartStopScreenshare").on("click", async function () {
      // Gestion du bouton de démarrage/arrêt du partage d'écran
      if (_videoState == VideoStates.ScreenShare) {
        await ManageVideo(VideoStates.None); // Cas d'arrêt
      } else {
        await ManageVideo(VideoStates.ScreenShare); // Commencer le partage d'écran
      }
    });
  }

  // Gérer la vidéo (caméra, partage d'écran ou aucune)
  async function ManageVideo(newVideoState) {
    if (newVideoState == VideoStates.None) {
      $("#btnStartStopCam").html(
        '<span class="material-icons">videocam_off</span>'
      );
      $("#btnStartStopScreenshare").html(
        '<div class="present-now-wrap d-flex justify-content-center flex-column align-items-center  mr-5 cursor-pointer" id="btnStartStopScreenshare" style="height:10vh;"><div class="present-now-icon"><span class="material-icons">present_to_all</span></div><div>Présent en cours</div></div>'
      );
      _videoState = newVideoState;

      ClearCurrentVideoCamStream(_rtpVideoSenders); // Effacer le flux vidéo actuel
      return;
    }

    try {
      var vstream = null;

      if (newVideoState == VideoStates.Camera) {
        // Obtenir le flux vidéo depuis la caméra
        vstream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: 1920,
            height: 1080,
          },
          audio: false,
        });
      } else if (newVideoState == VideoStates.ScreenShare) {
        // Obtenir le flux vidéo du partage d'écran
        vstream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            width: 1920,
            height: 1080,
          },
          audio: false,
        });

        vstream.oninactive = (e) => {
          ClearCurrentVideoCamStream(_rtpVideoSenders); // En cas d'arrêt du partage d'écran, effacer le flux vidéo
          $("#btnStartStopScreenshare").html(
            '<div class="present-now-wrap d-flex justify-content-center flex-column align-items-center  mr-5 cursor-pointer" id="btnStartStopScreenshare" style="height:10vh;"><div class="present-now-icon"><span class="material-icons">present_to_all</span></div><div>Présent en cours</div></div>'
          );
        };
      }

      ClearCurrentVideoCamStream(_rtpVideoSenders);

      _videoState = newVideoState;

      if (newVideoState == VideoStates.Camera) {
        $("#btnStartStopCam").html(
          '<span class="material-icons">videocam</span>'
        );
        $("#btnStartStopScreenshare").text("Partage d'écran");
      } else if (newVideoState == VideoStates.ScreenShare) {
        $("#btnStartStopCam").html(
          '<span class="material-icons">videocam_off</span>'
        );
        $("#btnStartStopScreenshare").html(
          '<div class="present-now-wrap d-flex justify-content-center flex-column align-items-center  mr-5 cursor-pointer" id="btnStartStopScreenshare" style="height:10vh;"><div class="present-now-icon"><span class="material-icons">present_to_all</span></div><div>Arrêter le partage</div></div>'
        );
      }

      if (vstream && vstream.getVideoTracks().length > 0) {
        _videoCamSSTrack = vstream.getVideoTracks()[0];

        if (_videoCamSSTrack) {
          _localVideoPlayer.srcObject = new MediaStream([_videoCamSSTrack]);

          AddUpdateAudioVideoSenders(_videoCamSSTrack, _rtpVideoSenders);
        }
      }
    } catch (e) {
      console.log(e);
      return;
    }
  }

  // Effacer le flux vidéo actuel
  function ClearCurrentVideoCamStream(rtpVideoSenders) {
    if (_videoCamSSTrack) {
      _videoCamSSTrack.stop();
      _videoCamSSTrack = null;
      _localVideoPlayer.srcObject = null;

      RemoveAudioVideoSenders(rtpVideoSenders); 
    }
  }

  // Supprimer les expéditeurs RTP pour l'audio
  async function RemoveAudioVideoSenders(rtpSenders) {
    for (var con_id in peers_con_ids) {
      if (rtpSenders[con_id] && IsConnectionAvailable(peers_conns[con_id])) {
        peers_conns[con_id].removeTrack(rtpSenders[con_id]);
        rtpSenders[con_id] = null;
      }
    }
  }

  // Ajouter ou mettre à jour les expéditeurs RTP pour l'audio
  async function AddUpdateAudioVideoSenders(track, rtpSenders) {
    for (var con_id in peers_con_ids) {
      if (IsConnectionAvailable(peers_conns[con_id])) {
        if (rtpSenders[con_id] && rtpSenders[con_id].track) {
          rtpSenders[con_id].replaceTrack(track);
        } else {
          rtpSenders[con_id] = peers_conns[con_id].addTrack(track);
        }
      }
    }
  }

  // Commencer avec l'audio
  async function startwithAudio() {
    try {
      var astream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: true,
      });
      _audioTrack = astream.getAudioTracks()[0];

      _audioTrack.onmute = function (e) {
        console.log(e);
      };
      _audioTrack.onunmute = function (e) {
        console.log(e);
      };

      _audioTrack.enabled = false;
    } catch (e) {
      console.log(e);
      return;
    }
  }

  // Créer une nouvelle connexion avec un autre participant
  async function createConnection(connid) {
    var connection = new RTCPeerConnection(iceConfiguration);

    // Gestion des événements de connexion ICE
    connection.onicecandidate = function (event) {
      console.log("onicecandidate", event.candidate);
      if (event.candidate) {
        _serverFn(
          JSON.stringify({
            iceCandidate: event.candidate,
          }),
          connid
        );
      }
    };
    connection.onicecandidateerror = function (event) {
      console.log("onicecandidateerror", event);
    };
    connection.onicegatheringstatechange = function (event) {
      console.log("onicegatheringstatechange", event);
    };
    connection.onnegotiationneeded = async function (event) {
      console.log("onnegotiationneeded", event);
      await _createOffer(connid);
    };
    connection.onconnectionstatechange = function (event) {
      console.log(
        "onconnectionstatechange",
        event.currentTarget.connectionState
      );
      if (event.currentTarget.connectionState === "connected") {
        console.log("connected");
      }
      if (event.currentTarget.connectionState === "disconnected") {
        console.log("disconnected");
      }
    };

    // Gestion des nouveaux flux média reçus
    connection.ontrack = function (event) {
      if (!_remoteVideoStreams[connid]) {
        _remoteVideoStreams[connid] = new MediaStream();
      }

      if (!_remoteAudioStreams[connid]) {
        _remoteAudioStreams[connid] = new MediaStream();
      }

      if (event.track.kind == "video") {
        _remoteVideoStreams[connid]
          .getVideoTracks()
          .forEach((t) => _remoteVideoStreams[connid].removeTrack(t));
        _remoteVideoStreams[connid].addTrack(event.track);

        var _remoteVideoPlayer = document.getElementById("v_" + connid);
        _remoteVideoPlayer.srcObject = null;
        _remoteVideoPlayer.srcObject = _remoteVideoStreams[connid];
        _remoteVideoPlayer.load();
      } else if (event.track.kind == "audio") {
        var _remoteAudioPlayer = document.getElementById("a_" + connid);
        _remoteAudioStreams[connid]
          .getVideoTracks()
          .forEach((t) => _remoteAudioStreams[connid].removeTrack(t));
        _remoteAudioStreams[connid].addTrack(event.track);
        _remoteAudioPlayer.srcObject = null;
        _remoteAudioPlayer.srcObject = _remoteAudioStreams[connid];
        _remoteAudioPlayer.load();
      }
    };

    peers_con_ids[connid] = connid;
    peers_conns[connid] = connection;

    // Ajouter la piste vidéo si la caméra ou le partage d'écran est activé
    if (
      _videoState == VideoStates.Camera ||
      _videoState == VideoStates.ScreenShare
    ) {
      if (_videoCamSSTrack) {
        AddUpdateAudioVideoSenders(_videoCamSSTrack, _rtpVideoSenders);
      }
    }

    return connection;
  }

  // Créer une offre (SDP) pour une connexion existante
  async function _createOffer(connid) {
    var connection = peers_conns[connid];
    console.log("connection.signalingState:" + connection.signalingState);
    var offer = await connection.createOffer();
    await connection.setLocalDescription(offer);

    // Envoyer l'offre au serveur
    _serverFn(
      JSON.stringify({
        offer: connection.localDescription,
      }),
      connid
    );
  }

  // Échanger des descriptions SDP (Offre, Réponse, ICE Candidate)
  async function exchangeSDP(message, from_connid) {
    console.log("messag", message);
    message = JSON.parse(message);

    if (message.answer) {
      // Réponse SDP reçue
      console.log("answer", message.answer);
      await peers_conns[from_connid].setRemoteDescription(
        new RTCSessionDescription(message.answer)
      );
      console.log("connection", peers_conns[from_connid]);
    } else if (message.offer) {
      // Offre SDP reçue
      console.log("offer", message.offer);

      // Créer une nouvelle connexion si elle n'existe pas déjà
      if (!peers_conns[from_connid]) {
        await createConnection(from_connid);
      }

      await peers_conns[from_connid].setRemoteDescription(
        new RTCSessionDescription(message.offer)
      );

      // Répondre à l'offre avec une réponse SDP
      var answer = await peers_conns[from_connid].createAnswer();
      await peers_conns[from_connid].setLocalDescription(answer);

      // Envoyer la réponse au serveur
      _serverFn(
        JSON.stringify({
          answer: answer,
        }),
        from_connid,
        _my_connid
      );
    } else if (message.iceCandidate) {
      // ICE Candidate reçu
      console.log("iceCandidate", message.iceCandidate);

      // Créer une connexion si elle n'existe pas déjà
      if (!peers_conns[from_connid]) {
        await createConnection(from_connid);
      }

      try {
        await peers_conns[from_connid].addIceCandidate(message.iceCandidate);
      } catch (e) {
        console.log(e);
      }
    }
  }

  // Vérifier si la connexion est disponible et active
  function IsConnectionAvailable(connection) {
    if (
      connection &&
      (connection.connectionState == "new" ||
        connection.connectionState == "connecting" ||
        connection.connectionState == "connected")
    ) {
      return true;
    } else {
      return false;
    }
  }

  // Fermer une connexion existante avec un participant
  function closeConnection(connid) {
    peers_con_ids[connid] = null;

    if (peers_conns[connid]) {
      peers_conns[connid].close();
      peers_conns[connid] = null;
    }

    if (_remoteAudioStreams[connid]) {
      _remoteAudioStreams[connid].getTracks().forEach((t) => {
        if (t.stop) t.stop();
      });
      _remoteAudioStreams[connid] = null;
    }

    if (_remoteVideoStreams[connid]) {
      _remoteVideoStreams[connid].getTracks().forEach((t) => {
        if (t.stop) t.stop();
      });
      _remoteVideoStreams[connid] = null;
    }
  }

  // Fonctions accessibles depuis l'extérieur du module
  return {
    init: async function (serverFn, my_connid) {
      await _init(serverFn, my_connid);
    },
    ExecuteClientFn: async function (data, from_connid) {
      await exchangeSDP(data, from_connid);
    },
    createNewConnection: async function (connid) {
      await createConnection(connid);
    },
    closeExistingConnection: function (connid) {
      closeConnection(connid);
    },
  };
})();





var MyApp = (function () {
  var socket = null; // Initialise la variable du socket à null
  var meeting_id = ""; // Initialise l'ID de la réunion à une chaîne vide
  var user_id = ""; // Initialise l'ID de l'utilisateur à une chaîne vide

  var lerverMain = true;


  // Fonction d'initialisation avec les IDs utilisateur et réunion
  function init(uid, mid) {
    user_id = uid;
    meeting_id = mid;

    // Met à jour le titre de l'utilisateur et l'affiche dans l'interface
    $("#me h2").text(user_id + "(Moi)");
    document.title = user_id;

    SignalServerEventBinding(); // Appelle la fonction pour lier les événements du serveur de signalisation
    EventBinding(); // Appelle la fonction pour lier les événements de l'interface utilisateur

    // Gestion du clic sur le bouton de partage de fichier
    $(document).on("click", ".share-button-wrap", function () {
      var attachFileArea = document.querySelector(".show-attach-file");
      var fileeName = $("#customFile").val().split("\\").pop(); // Récupère le nom du fichier
      var FileePath = "/attachment/" + meeting_id + "/" + fileeName + ""; // Construit le chemin du fichier

      // Affiche le lien de téléchargement du fichier dans l'interface et l'envoie via le socket
      attachFileArea.innerHTML +=
        "<div class='left-align' style='display:flex;align-items:center;'><img src='assets/images/other.jpg' style='height:40px;width:40px;' class='caller-image circle'><div style='font-weight:600;margin:0 5px;'>" +
        user_id +
        "</div>: <div><a style='color:#007bff;' href='" +
        FileePath +
        "' download>" +
        fileeName +
        "</a></div></div><br/>";
      $("label.custom-file-label").text("");
      socket.emit("fileTransferToOther", {
        username: user_id,
        meetingid: meeting_id,
        FileePath: FileePath,
        fileeName: fileeName,
      });
    });
  }

  // Fonction pour lier les événements du serveur de signalisation
  function SignalServerEventBinding() {
    socket = io.connect(); // Connecte le socket au serveur

    // Fonction serveur pour échanger les SDP (Session Description Protocol)
    var serverFn = function (data, to_connid) {
      socket.emit("exchangeSDP", {
        message: data,
        to_connid: to_connid,
      });
    };

    // Écouteur pour la réinitialisation de la page
    socket.on("reset", function () {
      location.reload();
    });

    // Écouteur pour recevoir et traiter les SDP échangés
    socket.on("exchangeSDP", async function (data) {
      await WrtcHelper.ExecuteClientFn(data.message, data.from_connid);
    });

    // Écouteur pour informer sur une nouvelle connexion entrante
    socket.on("informAboutNewConnection", function (data) {
      AddNewUser(data.other_user_id, data.connId, data.userNumber);
      WrtcHelper.createNewConnection(data.connId);
    });

    // Écouteur pour informer sur la fin d'une connexion
    socket.on("informAboutConnectionEnd", function (data) {
      $("#" + data.connId).remove(); // Supprime l'utilisateur de l'interface
      $(".participant-count").text(data.userCoun); // Met à jour le nombre de participants
      $("#participant_" + data.connId + "").remove(); // Supprime le participant de la liste
      WrtcHelper.closeExistingConnection(data.connId); // Ferme la connexion correspondante
    });

    // Écouteur pour afficher un message de chat reçu
    socket.on("showChatMessage", function (data) {
      var time = new Date();
      var lTime = time.toLocaleString("en-US", {
        hour: "numeric",
        minute: "numeric",
        hour12: true,
      });

      var div = $("<div>").html(
        "<span class='font-weight-bold mr-3' style='color:black'>" +
          data.from +
          "</span> " +
          lTime +
          "</br>" +
          data.message
      );
      $("#messages").append(div); // Affiche le message dans l'interface
    });

    // Ecoutes pour afficher la main lever, à faire



    // Écouteur pour afficher un message de fichier reçu
    socket.on("showFileMessage", function (data) {
      var time = new Date();
      var lTime = time.toLocaleString("en-US", {
        hour: "numeric",
        minute: "numeric",
        hour12: true,
      });

      var attachFileArea = document.querySelector(".show-attach-file");
      
      // Affiche le lien de téléchargement du fichier dans l'interface
      attachFileArea.innerHTML +=
        "<div class='left-align' style='display:flex;align-items:center;'><img src='assets/images/other.jpg' style='height:40px;width:40px;' class='caller-image circle'><div style='font-weight:600;margin:0 5px;'>" +
        data.username +
        "</div>: <div><a style='color:#007bff;' href='" +
        data.FileePath +
        "' download>" +
        data.fileeName +
        "</a></div></div><br/>";
    });

    // Écouteur pour gérer la connexion lorsque le socket se connecte
    socket.on("connect", () => {
      if (socket.connected) {
        WrtcHelper.init(serverFn, socket.id); // Initialise l'aide WebRTC avec la fonction serveur et l'ID de socket

        // Envoie les détails de l'utilisateur et de la réunion au serveur si disponibles
        if (user_id != "" && meeting_id != "") {
          socket.emit("userconnect", {
            dsiplayName: user_id,
            meetingid: meeting_id,
          });
        }
      }
    });

    // Écouteur pour recevoir la liste des utilisateurs connectés
    socket.on("userconnected", function (other_users) {
      var userNumber = other_users.length;
      var userNumb = userNumber + 1;
      $("#divUsers .other").remove(); // Supprime les utilisateurs existants de l'interface
      if (other_users) {
        for (var i = 0; i < other_users.length; i++) {
          // Ajoute chaque nouvel utilisateur à l'interface
          AddNewUser(
            other_users[i].user_id,
            other_users[i].connectionId,
            userNumb
          );
          WrtcHelper.createNewConnection(other_users[i].connectionId); // Crée une nouvelle connexion pour chaque utilisateur
        }
      }
      $(".toolbox").show(); // Affiche la boîte à outils de l'interface
      $("#messages").show(); // Affiche la section des messages
      $("#divUsers").show(); // Affiche la liste des utilisateurs
    });
  }

  // Fonction pour lier les événements de l'interface utilisateur
  function EventBinding() {
    // Écouteur pour le bouton de réinitialisation de la réunion
    $("#btnResetMeeting").on("click", function () {
      socket.emit("reset"); // Envoie une demande de réinitialisation au serveur
    });

    // Écouteur pour le bouton d'envoi de message
    $("#btnsend").on("click", function () {
      socket.emit("sendMessage", $("#msgbox").val()); // Envoie le message saisi au serveur
      $("#msgbox").val(""); // Efface le contenu de la zone de message
    });

    // Écouteur pour permettre le plein écran sur double-clic d'une vidéo d'utilisateur
    $("#divUsers").on("dblclick", "video", function () {
      this.requestFullscreen(); // Active le mode plein écran pour la vidéo cliquée
    });
  }

  // Fonction pour ajouter un nouvel utilisateur à l'interface
  function AddNewUser(other_user_id, connId, userNum) {
    var $newDiv = $("#otherTemplate").clone(); // Clone le modèle d'utilisateur
    $newDiv = $newDiv.attr("id", connId).addClass("other"); // Attribue un ID et une classe au nouvel élément
    $newDiv.find("h2").text(other_user_id); // Met à jour le nom de l'utilisateur dans le modèle
    $newDiv.find("video").attr("id", "v_" + connId); // Attribue un ID à la balise vidéo
    $newDiv.find("audio").attr("id", "a_" + connId); // Attribue un ID à la balise audio
    $newDiv.show(); // Affiche l'élément nouvellement créé
    $("#divUsers").append($newDiv); // Ajoute l'élément à la liste des utilisateurs
    $(".in-call-wrap-up").append(
      // Ajoute l'utilisateur à la liste des participants en bas de l'interface
      '<div class="in-call-wrap d-flex justify-content-between align-items-center mb-3" id="participant_' +
        connId +
        '" style=""> <div class="participant-img-name-wrap display-center cursor-pointer"> <div class="participant-img"> <img src="images/me2.png" alt="" class="border border-secondary" style="height: 40px;width: 40px;border-radius: 50%;"> </div> <div class="participant-name ml-2">' +
        other_user_id +
        '</div> </div> <div class="participant-action-wrap display-center"> <div class="participant-action-dot display-center mr-2 cursor-pointer"> <span class="material-icons"> more_vert </span> </div> <div class="participant-action-pin display-center cursor-pointer"> <span class="material-icons"> push_pin </span> </div> </div> </div>'
    );

    $(".participant-count").text(userNum); // Met à jour le nombre total des participants affiché
  }

  // Interface publique avec la fonction d'initialisation
  return {
    _init: function (uid, mid) {
      init(uid, mid);
    },
  };
})();