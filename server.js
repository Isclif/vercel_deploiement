// require("./models/db"); // Charge le module de connexion à la base de données

const https = require('https'); // Importe le module HTTPS pour créer un serveur sécurisé
const express = require("express"); // Importe le framework Express pour créer des applications web
const path = require("path"); // Importe le module Path pour travailler avec les chemins de fichiers et de répertoires
const exphbs = require("express-handlebars"); // Importe le moteur de template Handlebars pour Express
const bodyparser = require("body-parser"); // Importe le middleware Body-parser pour analyser les corps de requêtes
const http = require('http')

// Importe les contrôleurs pour gérer les différentes routes de l'application
const homeController = require("./controllers/homeController");
const loginController = require("./controllers/loginController");
// const fileUpload = require("express-fileupload"); // Importe le middleware pour gérer les fichiers uploadés

const fs = require("fs"); // Importe le module FS pour travailler avec le système de fichiers

var _userConnections = []; // Initialise un tableau pour stocker les connexions des utilisateurs
var app = express(); // Crée une application Express

// Configure le middleware Body-parser
app.use(
    bodyparser.urlencoded({
        extended: true,
    })
);
app.use(bodyparser.json()); // Configure le middleware pour parser les requêtes JSON

// Configure le moteur de template Handlebars
app.set("views", path.join(__dirname, "/views/"));
app.engine(
    "hbs",
    exphbs({
        extname: "hbs",
        defaultLayout: "mainLayout",
        layoutsDir: __dirname + "/views/layouts/",
    })
);
app.use(express.static(path.join(__dirname, "public"))); // Définit le dossier public pour les fichiers statiques
app.set("view engine", "hbs"); // Définit Handlebars comme moteur de vue

// Configure les routes de l'application
app.use("/", homeController);
app.use("/sign", loginController);

// Charger le certificat SSL et la clé pour le serveur HTTPS
// const options = {
//     key: fs.readFileSync('key.pem'),
//     cert: fs.readFileSync('cert.pem')
// };

// Crée un serveur HTTPS
// const server = https.createServer(options, app);

const server = http.createServer(app);

const ipAddress = '172.19.120.186';
const port = 3000;

// Démarre le serveur HTTPS
// server.listen(port, ipAddress, () => {
//     console.log(`Serveur démarré sur https://${ipAddress}:${port}/sign`);
// });

// Démarre le serveur HTTPS
server.listen(port, () => {
    console.log(`Serveur démarré sur le port ${port}`);
});


const io = require("socket.io")(server); // Initialise Socket.io avec le serveur HTTPS

// Écoute chaque connexion
io.on("connection", (socket) => {
    console.log(socket.id);

    // Gère l'événement de connexion utilisateur
    socket.on("userconnect", (data) => {
        console.log("userconnect", data.dsiplayName, data.meetingid);

        var other_users = _userConnections.filter(
            (p) => p.meeting_id == data.meetingid
        );

        _userConnections.push({
            connectionId: socket.id,
            user_id: data.dsiplayName,
            meeting_id: data.meetingid,
        });

        var userCount = _userConnections.length;
        console.log(userCount);
        other_users.forEach((v) => {
            socket.to(v.connectionId).emit("informAboutNewConnection", {
                other_user_id: data.dsiplayName,
                connId: socket.id,
                userNumber: userCount,
            });
        });

        socket.emit("userconnected", other_users);
    });

    // Gère l'échange de SDP
    socket.on("exchangeSDP", (data) => {
        socket.to(data.to_connid).emit("exchangeSDP", {
            message: data.message,
            from_connid: socket.id,
        });
    });

    // Gère la réinitialisation des connexions
    socket.on("reset", (data) => {
        var userObj = _userConnections.find((p) => p.connectionId == socket.id);
        if (userObj) {
            var meetingid = userObj.meeting_id;
            var list = _userConnections.filter((p) => p.meeting_id == meetingid);
            _userConnections = _userConnections.filter(
                (p) => p.meeting_id != meetingid
            );

            list.forEach((v) => {
                socket.to(v.connectionId).emit("reset");
            });

            socket.emit("reset");
        }
    });

    // Gère l'envoi de messages
    socket.on("sendMessage", (msg) => {
        console.log(msg);
        var userObj = _userConnections.find((p) => p.connectionId == socket.id);
        if (userObj) {
            var meetingid = userObj.meeting_id;
            var from = userObj.user_id;

            var list = _userConnections.filter((p) => p.meeting_id == meetingid);
            console.log(list);

            list.forEach((v) => {
                socket.to(v.connectionId).emit("showChatMessage", {
                    from: from,
                    message: msg,
                    time: getCurrDateTime(),
                });
            });

            socket.emit("showChatMessage", {
                from: from,
                message: msg,
                time: getCurrDateTime(),
            });
        }
    });

    // Gère la main baisser
    socket.on("raiseHand", (hand) => {
        console.log(`hand rised by ${socket.id}`);

        var userObj = _userConnections.find((p) => p.connectionId == socket.id);
        if (userObj) {
            var meetingid = userObj.meeting_id;
            var from = userObj.user_id;

            var list = _userConnections.filter((p) => p.meeting_id == meetingid);
            console.log(list);

            list.forEach((v) => {
                socket.to(v.connectionId).emit("handRaised", {
                    handRised: hand,
                    socketId: socket.id
                });
            });

            socket.emit('handRaised', {
                handRised: hand,
                socketId: socket.id
            });
        }
    
    });
    
    // Gère la main baisser
    socket.on("lowerHand", () => {
    console.log(`hand lowered by ${socket.id}`);
    socket.emit('handLowered', socket.id);
    
    });

    // Gère le transfert de fichiers
    socket.on("fileTransferToOther", function (msg) {
        console.log(msg);
        var userObj = _userConnections.find((p) => p.connectionId == socket.id);
        if (userObj) {
            var meetingid = userObj.meeting_id;
            var from = userObj.user_id;

            var list = _userConnections.filter((p) => p.meeting_id == meetingid);
            console.log(list);

            list.forEach((v) => {
                socket.to(v.connectionId).emit("showFileMessage", {
                    from: from,
                    username: msg.username,
                    meetingid: msg.meetingid,
                    FileePath: msg.FileePath,
                    fileeName: msg.fileeName,
                    time: getCurrDateTime(),
                });
            });
        }
    });

    // Gère la déconnexion
    socket.on("disconnect", function () {
        console.log("Got disconnect!");

        var userObj = _userConnections.find((p) => p.connectionId == socket.id);
        if (userObj) {
            var meetingid = userObj.meeting_id;

            _userConnections = _userConnections.filter(
                (p) => p.connectionId != socket.id
            );
            var list = _userConnections.filter((p) => p.meeting_id == meetingid);

            list.forEach((v) => {
                var userCou = _userConnections.length;
                socket.to(v.connectionId).emit("informAboutConnectionEnd", {
                    connId: socket.id,
                    userCoun: userCou,
                });
            });
        }
    });
});

// Fonction pour obtenir la date et l'heure actuelles
function getCurrDateTime() {
    let date_ob = new Date();
    let date = ("0" + date_ob.getDate()).slice(-2);
    let month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
    let year = date_ob.getFullYear();
    let hours = date_ob.getHours();
    let minutes = date_ob.getMinutes();
    let seconds = date_ob.getSeconds();
    var dt =
        year +
        "-" +
        month +
        "-" +
        date +
        " " +
        hours +
        ":" +
        minutes +
        ":" +
        seconds;
    return dt;
}