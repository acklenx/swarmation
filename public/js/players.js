var WIDTH = 96;
var HEIGHT = 60;
var PLAYER;
var PLAYERS = {};
var MAP = [];
var FORMATION_COMPLETED;
var FORMATION;
var Player;
var sendAction;
var NAMES = ['Saber', 'Tooth', 'Moose', 'Lion', 'Peanut', 'Jelly', 'Thyme', 'Zombie', 'Cranberry'];

var MARGIN = 1500;

(function($, undefined) {

    Player = function Player(id, left, top, isSelf) {
        this.id = id;

        if (!left) {
            left = Math.floor(Math.random() * WIDTH);
            top = Math.floor(Math.random() * HEIGHT);
            while (Player.atPosition(left, top)) {
                left = Math.floor(Math.random() * WIDTH);
                top = Math.floor(Math.random() * HEIGHT);
            }
        }
        this.setPosition(left, top);
        this.isSelf = isSelf;
        this.name = NAMES[Math.floor(Math.random()*NAMES.length)];
        this.score = 0;
        this.inFormation = 0;
        if (isSelf) {
            this.sendInfo();
        }
    };

    Player.atPixel = function(x, y) {
        return Player.atPosition(Player.getLeft(x), Player.getTop(y));
    };

    Player.atPosition = function(left, top) {
        if (!MAP[left]) MAP[left] = [];
        return MAP[left][top];
    };

    Player.getLeft = function(x) { return Math.floor(x/10); };
    Player.getTop = function(y) { return Math.floor(y/10); };

    Player.directions = {
        left: function(left, top) { return [left-1, top] },
        right: function(left, top) { return [left+1, top] },
        up: function(left, top) { return [left, top-1] },
        down: function(left, top) { return [left, top+1] },
    };

    Player.prototype = {
        getX: function() { return this.left * 10 + 1; },
        getY: function() { return this.top * 10 + 1; },

        setPosition: function(left, top) {
            // cancel in case of collisions
            if (Player.atPosition(left, top)) return;
            // cancel if out of bounds
            if ((left < 0) || (left >= WIDTH)) return;
            if ((top < 0) || (top >= HEIGHT)) return;

            if (!MAP[this.left]) MAP[this.left] = [];
            MAP[this.left][this.top] = null;
            this.left = left;
            this.top = top;
            if (!MAP[left]) MAP[left] = [];
            MAP[left][top] = this;
        },

        move: function(direction) {
            var newp = Player.directions[direction](this.left, this.top);
            this.setPosition(newp[0], newp[1]);
            if (this.isSelf) {
                this.sendInfo();
            }
        },

        checkFormation: function(formation) {
            if (!this.id) return;
            var otherIds = [];
            for (var i in formation.points) {
                var dx = formation.points[i][0];
                var dy = formation.points[i][1];
                var other = Player.atPosition(this.left+dx, this.top+dy);
                if (!other) return;
                otherIds.push(other.id);
            }
            this.formationMade(formation.name);
            sendAction('formationMade', { formation: formation.name, ids: otherIds });
            for (var i in otherIds) {
                PLAYERS[otherIds[i]].inFormation = 10;
            }
        },

        formationMade: function(name) {
            if (!FORMATION) return;
            this.inFormation = 10;
            if (name == FORMATION.name) FORMATION_COMPLETED = true;
        },

        sendInfo: function(full) {
            if (full) {
                sendAction('info', {
                    left: this.left,
                    top: this.top,
                    name: this.name,
                    score: this.score
                });
            } else {
                sendAction('info', {
                    left: this.left,
                    top: this.top
                });
            }
        },

        getInfo: function(info) {
            this.setPosition(info.left, info.top);
            if (info.name) this.name = info.name;
            if (info.score) this.score = info.score;
        },

        showTooltip: function() {
            $('#tooltip')
                .show()
                .css('left', this.getX()+$('#play').offset().left-6)
                .css('top', this.getY()+$('#play').offset().top+25)
                .find('.name').text(this.name).end()
                .find('.score').text(this.score);
        },

        hideTooltip: function() {
            $('#tooltip').hide();
        }
    };

    $('#play').bind('welcome', function(event, data) {
        setTimeout(function() {
            PLAYER = new Player(data.id, null, null, true);
        }, 2000);
    });

    $('#play').bind('info', function(event, data) {
        if (!PLAYERS[data.id]) {
            PLAYERS[data.id] = new Player(data.id, data.left, data.top);
        }
        PLAYERS[data.id].getInfo(data);
    });

    $('#play').bind('connected', function(event, data) {
        PLAYER.sendInfo(true);
    });

    $('#play').bind('disconnected', function(event, data) {
        var p = PLAYERS[data.id];
        if (!p) return;
        delete MAP[p.left][p.top];
        delete PLAYERS[data.id];
    });

    $('#play').bind('formationMade', function(event, data) {
        if (!PLAYER.id) return;
        if ($.inArray(PLAYER.id, data.ids) >= 0) PLAYER.formationMade(data.formation);
        PLAYERS[data.id].inFormation = 10;
        for (var j = 0; j < data.ids.length; j++) {
            if (PLAYERS[data.ids[j]]) PLAYERS[data.ids[j]].inFormation = 10;
        }
    });

    $('#play').bind('nextFormation', function(event, data) {
        FORMATION = Formations[data.formation];
        $('#formation')
            .css('background', 'url(/images/formations/'+data.formation.toLowerCase()+'.png) no-repeat center top')
            .text(data.formation).end();
        var timeleft = data.time;
        $('#countdown').text(timeleft);
        var interval = setInterval(function() {
            timeleft--;
            $('#countdown').text(timeleft);
        }, 1000);
        setTimeout(function() {
            clearInterval(interval);
            $('#countdown').text('0');
            if (FORMATION) {
                PLAYER.checkFormation(FORMATION);
                setTimeout(function() {
                    var delta;
                    var score = PLAYER.score;
                    if (FORMATION_COMPLETED) {
                        delta = FORMATION.points.length+1;
                        PLAYER.score += delta;
                        displayNotice('You completed '+FORMATION.name+'. You gain '+delta+' points!');
                    } else {
                        delta = 15-(FORMATION.points.length+1);
                        PLAYER.score -= delta;
                        if (PLAYER.score < 0) {
                            PLAYER.score = 0;
                        }
                        displayNotice('You did not make '+FORMATION.name+'! Lose '+delta+' points.');
                    }
                    if (PLAYER.score != score) {
                        PLAYER.sendInfo(true);
                        $('#score .score').text(PLAYER.score);
                    }
                    FORMATION_COMPLETED = false;
                }, MARGIN);
            }
        }, data.time*1000);
    });

    // sockets

    io.setPath('/io/');
    var socket;

    function connect() {
        socket = new io.Socket('', { transports: ['websocket', 'server-events', 'flashsocket', 'htmlfile', 'xhr-multipart', 'xhr-polling']});
        socket.connect();

        socket.on('message', function(data) {
            //console.log([data.id, data.type, data.left, data.top, data.score, data.formation, data]);
            $('#play').trigger(data.type, data);
        });
        socket.on('connect', function() {
            if (PLAYER) PLAYER.sendInfo(true);
            PLAYERS = {};
            MAP = [];
        });

        socket.on('disconnect', function() {
            connect();
            var interval = setInterval(function() {
                if (socket.connected) {
                    clearInterval(interval);
                } else {
                    connect();
                }
            }, 1000);
        });
    };

    sendAction = function(type, data) {
        data.type = type;
        socket.send(data);
    };

    connect();

})(jQuery);
