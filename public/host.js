/*
p5.multiplayer - HOST

This 'host' sketch is intended to be run in desktop browsers. 
It connects to a node server via socket.io, from which it receives
rerouted input data from all connected 'clients'.

Navigate to the project's 'public' directory.
Run http-server -c-1 to start server. This will default to port 8080.
Run http-server -c-1 -p80 to start server on open port 80.

*/

////////////
// Network Settings
let serverIp;
// const serverIp      = '127.0.0.1';
const serverPort    = '3000';
const local         = true;   // true if running locally, false
                              // if running on remote server
if (local) {
  serverIp = '192.168.0.18';
} else {
  serverIp = 'https://deepseaonline.herokuapp.com';
}

// Global variables here. ---->

const velScale	= 10;
const debug = true;
let game;
let gameLog = "let the games begin!";
let move = "roll";

// <----

function preload() {
  setupHost();
}

function setup () {
  createCanvas(windowWidth, windowHeight);

  // Host/Game setup here. ---->
  
  game = new Game(width, height);
  game.setup();

  // <----
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function draw () {
  background(15);

  if(isHostConnected(display=true)) {
    // Host/Game draw here. --->

    // Display player IDs in top left corner
    game.printPlayerIds(5, 20);

    // Update and draw game objects
    game.draw();

    // <----

    // Display server address
    displayAddress();
  }
}

function onClientConnect (data) {
  // Client connect logic here. --->
  console.log(data.id + ' has connected.');

  if (!game.checkId(data.id)) {
    game.add(data.id,
            random(1.05*(width/2-50), 0.95*(width/2-50+100)),
            random(1.05*20, 0.95*(20+50)),
            10, 10
    );
  }

  // <----
}

function onClientDisconnect (data) {
  // Client disconnect logic here. --->

  if (game.checkId(data.id)) {
    game.remove(data.id);
  }

  // <----
}

function onReceiveData (data) {
  // Input data processing here. --->
  // console.log(data);

  if (data.type === 'joystick') {
    processJoystick(data);
  }
  else if (data.type === 'button') {
    processButton(data);
  }
  else if (data.type === 'flipButton') {
    processFlipButton(data);
  }
  else if (data.type === 'takeButton') {
    processTakeButton(data);
  }
  else if (data.type === 'leaveButton') {
    processLeaveButton(data);
  }
  else if (data.type === 'playerColor') {
    game.setColor(data.id, data.r*255, data.g*255, data.b*255);
  }

  // <----

  /* Example:
     if (data.type === 'myDataType') {
       processMyData(data);
     }

     Use `data.type` to get the message type sent by client.
  */
}

// This is included for testing purposes to demonstrate that
// messages can be sent from a host back to all connected clients
function mousePressed() {
  sendData('timestamp', { timestamp: millis() });
}

////////////
// Input processing
// function processJoystick (data) {
  
//   game.setVelocity(data.id, data.joystickX*velScale, -data.joystickY*velScale);

//   if (debug) {
//     console.log(data.id + ': {' +
//                 data.joystickX + ',' +
//                 data.joystickY + '}');
//   }
// }

function processButton (data) {
  // console.log(game.playerIds, game.playerTurn, data.id);
  if (game.playerIds[game.playerTurn] == data.id && !game.players[data.id].rolled) {
    game.players[data.id].val = data.button;
    game.rollDice(data.id);
    move = "pick/drop treasure"
  } else if (game.playerIds[game.playerTurn] == data.id && game.players[data.id].rolled) {
    gameLog = 'Already rolled. Take/drop treasure or end your turn.';
  }
  // game.createRipple(data.id, 300, 1000);
  
  if (debug) {
    console.log(data.id + ': ' +
                data.button);
  }
}

function processFlipButton (data) {
  if (game.playerIds[game.playerTurn] == data.id && !game.players[data.id].rolled
    && (game.players[data.id].pos > 0)) {
    game.players[data.id].val = data.flipButton;
    game.flipDirection(data.id);
  } else if (game.playerIds[game.playerTurn] == data.id && !game.players[data.id].rolled
    && (game.players[data.id].pos == -1)) {
    gameLog = "You're still in the Sub dude...";
  }

  if (debug) {
    console.log(data.id + ': ' +
                data.flipButton);
  }
}

function processTakeButton (data) {
  if (game.playerIds[game.playerTurn] == data.id && game.players[data.id].rolled) {
    game.players[data.id].val = data.takeButton;
    game.takeTreasure(data.id);
    game.players[data.id].rolled = false;
    move = "roll";
    if ((game.playerTurn+1) == game.playerIds.length) {
      game.playerTurn = 0;
    } else {
      game.playerTurn++;
    }    
  } else if (game.playerIds[game.playerTurn] == data.id && !game.players[data.id].rolled) {
    gameLog = 'Please roll first.';
  }

  if (debug) {
    console.log(data.id + ': ' +
                data.takeButton);
  }
}

function processLeaveButton (data) {
  if (game.playerIds[game.playerTurn] == data.id && game.players[data.id].rolled) {
    game.players[data.id].val = data.leaveButton;
    game.players[data.id].rolled = false;
    move = "roll";
    if ((game.playerTurn+1) == game.playerIds.length) {
      game.playerTurn = 0;
    } else {
      game.playerTurn++;
    }
  } else if (game.playerIds[game.playerTurn] == data.id && !game.players[data.id].rolled) {
    gameLog = 'Please roll first.';
  }
  // do nothing for now

  if (debug) {
    console.log(data.id + ': ' +
                data.leaveButton);
  }
}

////////////
// Game
// This simple placeholder game makes use of p5.play
class Game {
  constructor (w, h) {
    this.w          = w;
    this.h          = h;
    this.players	= {};
    this.numPlayers	= 0;
    this.id         = 0;
    this.colliders	= new Group();
    this.ripples    = new Ripples();
    // length 100, height 50
    this.sub        = new Sub(w/2-50, 20, 80);
    this.treasures  = new Treasures(5, 10, 7, w/2-50, 100);
    this.dice1 = 3;
    this.dice2 = 3;
    this.gameOver = false;
    // there are 24 frames per second
    this.count = 73;
    this.playerTurn = 0;
    this.playerIds = [];
    this.movePlayer = null;
  }

  add (id, x, y, w, h) {
    this.players[id] = createSprite(x, y, w, h);
    this.players[id].id = "p"+this.id;
    this.players[id].setCollider("rectangle", 0, 0, w, h);
    this.players[id].color = color(255, 255, 255);
    this.players[id].shapeColor = color(255, 255, 255);
    this.players[id].scale = 1;
    this.players[id].mass = 1;
    this.players[id].pos = -1;
    this.players[id].treasures = [];
    this.players[id].score = 0;
    this.players[id].direction = 'down';
    this.players[id].rolled = false;
    this.colliders.add(this.players[id]);
    print(this.players[id].id + " added.");
    this.id++;
    this.numPlayers++;
    this.playerIds.push(id);
  }

  setup() {
    this.treasures.createTreasures();
    console.log(this.treasures);
  }

  draw() {
    this.checkBounds();
    this.ripples.draw();
    this.sub.draw();
    this.treasures.draw();
    this.printLegend(this.w*0.01, this.h*0.65);
    if (this.count < 72) {
      if (this.count%3 == 0) {
        this.dice1 = getRandomInt(1, 3);
        this.dice2 = getRandomInt(1, 3);
        this.count++;    
      } else {
        this.count++;            
      }
    } else if (this.count == 72) {
      this.dice1 = getRandomInt(1, 3);
      this.dice2 = getRandomInt(1, 3);
      this.count++;
      this.move(this.movePlayer); 
      this.createRipple(this.movePlayer, 300, 1000);       
    }
    this.displayDice(this.w, 20);
    drawSprites();

    if (this.gameOver) {
      push();
        fill(0, 155);
        rect(0, 0, this.w, this.h);
        noStroke();
        fill(255);
        textSize(150);
        textAlign(CENTER);
        text("GAME OVER", this.w/2, this.h/2);
        this.printPlayerScores(this.w/2-80, this.h/2+80);
      pop();      
    }

    this.printLog(gameLog, this.playerIds, this.playerTurn, this.players, move, this.w*.93, this.h*.2);
  }

  printLog(gameLog, playerIds, playerTurn, players, move, x, y) {
    push();
      noStroke();
      fill(255);
      textSize(25);
      textAlign(RIGHT);
      text(gameLog, x, y);
      let turn;
      if (playerIds.length > 0) {
        if (players[playerIds[playerTurn]]) {
          turn = players[playerIds[playerTurn]].id;          
        }
      } else {
        turn = "p0";
      }
      fill(200, 200, 0);
      text("it is " + turn + "'s turn to " + move, x, y+30);
    pop();
  }

  createRipple(id, r, duration) {
    this.ripples.add(
      this.players[id].position.x, 
      this.players[id].position.y, 
      r, 
      duration, 
      this.players[id].color);
  }

  flipDirection(id) {
    this.players[id].direction = 'up';
    console.log(this.players[id].direction);
  }

  takeTreasure(id) {
    if (this.players[id].direction === 'down' && !this.treasures.treasures[this.players[id].pos].taken) {
      var tcopy = this.treasures.treasures[this.players[id].pos];
      var t = new Treasure(tcopy.x, tcopy.y, tcopy.tvalue, tcopy.tcolor);
      this.players[id].treasures.push(t);
      this.treasures.treasures[this.players[id].pos].taken = true;
    } else if (this.players[id].direction === 'up' && this.treasures.treasures[this.players[id].pos].taken) {
      if (this.players[id].treasures.length > 0) {
        var t = this.players[id].treasures[0];
        this.players[id].treasures.splice(0, 1);
        this.treasures.treasures[this.players[id].pos].tvalue = t.tvalue;
        this.treasures.treasures[this.players[id].pos].tcolor = t.tcolor;
        this.treasures.treasures[this.players[id].pos].taken = false;
      }
    }
    // TODO: if player is going up and clicks this button, drop the treasure
  }

  displayDice(w, h) {
      push();
          // fill(255, 0, 0);
          // rect(w*0.9, h, 30, 30);
          // rect(w*0.9 + 40, h, 30, 30);
          // fill(255);
          // textSize(20);
          // text(this.dice1, w*0.9 + 10, h + 20);
          // text(this.dice2, w*0.9 + 50, h + 20);
          fill(255, 0, 0);
          rect(w*0.85, h, 50, 50);
          rect(w*0.85 + 60, h, 50, 50);
          fill(255);
          textSize(40);
          text(this.dice1, w*0.86, h+this.h*0.05);
          text(this.dice2, w*0.86 + 60, h+this.h*0.05);          
      pop(); 
  }

  rollDice(id) {
    this.count = 0;
    this.movePlayer = id;
    this.players[id].rolled = true;
  }

  move(id) {
    // players roll = dice sum - no. of treasures
    var move = this.dice1 + this.dice2 - this.players[id].treasures.length;
    if (move < 0) { move = 0 };
    // reset existing tile to false (if not in the sub)
    if (this.players[id].pos > 0) {
      this.treasures.treasures[this.players[id].pos].hasPlayer = false;      
    }
    // you got to move it move it
    for (var i = 0; i < move; i++) {
      if (this.players[id].direction === 'down') {
        if (this.players[id].pos+1 == this.treasures.treasures.length) {
          //do nothing
        } else if (!this.treasures.treasures[(this.players[id].pos+1)].hasPlayer) {
          this.players[id].pos++;          
        } else {
          // bunny hop
          var h = 2;
          while (this.treasures.treasures[(this.players[id].pos+h)].hasPlayer) {
            h++;
          }
          this.players[id].pos+=h;
        }
      } else if (this.players[id].direction === 'up') {
        if ((this.players[id].pos-1) < 0) {
          this.players[id].pos = -1;
          var newPlayerIds = [];
          this.playerIds.forEach(function(playerId) {
            if (playerId != id) {
              newPlayerIds.push(playerId);
            }
          });
          this.playerIds = newPlayerIds;
          if (this.playerIds.length == 0) {
            this.endGame();
          }
          console.log('made it back to the sub');
        } else {
          if (!this.treasures.treasures[(this.players[id].pos-1)].hasPlayer) {
            this.players[id].pos--;
          } else {
            // bunny hop  
            var h = 2;
            while (!((this.players[id].pos-h) < 0) && this.treasures.treasures[(this.players[id].pos-h)].hasPlayer) {
              h++;
            }            
            this.players[id].pos-=h;
          }
        }
      }      
    }

    console.log(this.players[id].pos);
    // player is now standing on this tile
    if (this.players[id].pos >= 0) {
      this.players[id].position.x = this.treasures.treasures[this.players[id].pos].x;
      this.players[id].position.y = this.treasures.treasures[this.players[id].pos].y;
      this.treasures.treasures[this.players[id].pos].hasPlayer = true;      
    } else {
      this.players[id].position.x = getRandomInt(1.05*this.sub.x, 0.95*(this.sub.x+100));
      this.players[id].position.y = getRandomInt(1.05*this.sub.y, 0.95*(this.sub.y+50));
    }

    // reduce air by how many treasures the player is holding
    if (this.sub.air - this.players[id].treasures.length <= 0) {
      this.sub.air = 0;
      this.endGame();
    } else {
      this.sub.air -= this.players[id].treasures.length;      
    }
  }

  endGame() {
    for (let id in this.players) {
      if (this.players[id].pos >= 0) {
        this.players[id].treasures = [];
      } else {
        for (let t in this.players[id].treasures) {
          this.players[id].score += this.players[id].treasures[t].tvalue;
        }
      }
    }
    this.gameOver = true;
  }

  setColor (id, r, g, b) {
    this.players[id].color = color(r, g, b);
    this.players[id].shapeColor = color(r, g, b);

    print(this.players[id].id + " color added.");
  }

  remove (id) {
      this.colliders.remove(this.players[id]);
      this.players[id].remove();
      var newPlayerIds = [];
      this.playerIds.forEach(function(playerId) {
        if (playerId != id) {
          newPlayerIds.push(playerId);
        }
      });
      this.playerIds = newPlayerIds;
      delete this.players[id];
      this.numPlayers--;
  }

  checkId (id) {
    if (id in this.players) { return true; }
    else { return false; }
  }

  printPlayerIds (x, y) {
    push();
        noStroke();
        fill(255);
        textSize(16);
        text("# players: " + this.numPlayers, x, y);

        y = y + 16;
        // fill(200);
        for (let id in this.players) {
            fill(this.players[id].color);
            text(this.players[id].id, x, y);
            for (var i = 0; i < this.players[id].treasures.length; i++) {
              var treasure = this.players[id].treasures[i];
              if (treasure.tcolor == 0) {
                // fill(255, 255, 0, 100);
                fill('#032642');
              } else if (treasure.tcolor == 1) {
                // fill(255, 165, 0, 100)
                fill('#06508A');
              } else if (treasure.tcolor == 2) {
                // fill(255, 69, 0, 100);
                fill('#0972C4');
              } else if (treasure.tcolor == 3) {
                fill('#389CD8'); 
              } else if (treasure.tcolor == -1) {
                fill(255, getRandomInt(200, 255), 0);
              } else if (treasure.tcolor == -2) {
                fill(0, 255, getRandomInt(1, 255));
              }
              ellipse((15+x)+15*(i+1), y-5, 10, 10)
            }
            y += 16;
            // fill(200)
        }
    pop();
  }

  printLegend(x, y) {
    push();
      noStroke();
      fill(255);
      textSize(16);
      text("Treasure Points:", x, y);

      y += 20;

      var colorArr = ['#032642', '#06508A', '#0972C4', '#389CD8'];
      var points = ["1-3pts", "4-6pts", "7-9pts", "13-15pts", "1-10pts", "5-18pts"];

      for (var i = 0; i < 6; i++) {
        if (i == 4) {
          fill(255, getRandomInt(200, 255), 0);
          rect(x, y-15, 120, 18);
          fill(0);
          text(points[i], x+5, y);
        } else if (i == 5) {
          fill(0, 255, getRandomInt(1, 255));
          rect(x, y-15, 120, 18);
          fill(0);
          text(points[i], x+5, y);            
        }  else {
          fill(colorArr[i]);
          rect(x, y-15, 120, 18);  
          fill(255);
          text(points[i], x+5, y);           
        }
        y += 20;
      }
    pop();
  } 

  printPlayerScores(x, y) {
    push();   
      noStroke();
      textSize(50);
      for (let id in this.players) {
      fill(255);
      text(this.players[id].id, x, y);
      var xrel = x+50;
        for (var i = 0; i < this.players[id].treasures.length; i++) {
          var treasure = this.players[id].treasures[i];
          if (treasure.tcolor == 0) {
            // fill(255, 255, 0, 100);
            fill('#032642');
          } else if (treasure.tcolor == 1) {
            // fill(255, 165, 0, 100)
            fill('#06508A');
          } else if (treasure.tcolor == 2) {
            // fill(255, 69, 0, 100);
            fill('#0972C4');
          } else if (treasure.tcolor == 3) {
            fill('#389CD8'); 
          } else if (treasure.tcolor == -1) {
            fill(255, getRandomInt(200, 255), 0);
          } else if (treasure.tcolor == -2) {
            fill(0, 255, getRandomInt(1, 255));
          }
          xrel += 40*(i+1);
          ellipse(xrel, y-15, 47, 47);
          fill(0); 
          text(treasure.tvalue, xrel, y);
        }
        xrel += 50;
        text(this.players[id].score, y);
        y += 50;       
      }
    pop();
  }

  setVelocity(id, velx, vely) {
    this.players[id].velocity.x = velx;
    this.players[id].velocity.y = vely;
  }

  checkBounds() {
      for (let id in this.players) {

          if (this.players[id].position.x < 0) {
              this.players[id].position.x = this.w - 1;
          }

          if (this.players[id].position.x > this.w) {
              this.players[id].position.x = 1;
          }

          if (this.players[id].position.y < 0) {
              this.players[id].position.y = this.h - 1;
          }

          if (this.players[id].position.y > this.h) {
              this.players[id].position.y = 1;
          }
      }
  }
}

// A simple pair of classes for generating ripples
class Ripples {
  constructor() {
    this.ripples = [];
  }

  add(x, y, r, duration, rcolor) {
    this.ripples.push(new Ripple(x, y, r, duration, rcolor));
  }

  draw() {
    for (let i = 0; i < this.ripples.length; i++) {
      // Draw each ripple in the array
      if(this.ripples[i].draw()) {
        // If the ripple is finished (returns true), remove it
        this.ripples.splice(i, 1);
      }
    }
  }
}

class Ripple {
  constructor(x, y, r, duration, rcolor) {
    this.x = x;
    this.y = y;
    this.r = r;

    // If rcolor is not defined, default to white
    if (rcolor == null) {
      rcolor = color(255);
    }

    this.stroke = rcolor;
    this.strokeWeight = 3;

    this.duration = duration;   // in milliseconds
    this.startTime = millis();
    this.endTime = this.startTime + this.duration;
  }

  draw() {
    let progress = (this.endTime - millis())/this.duration;
    let r = this.r*(1 - progress);

    push();
      stroke(red(this.stroke), 
             green(this.stroke), 
             blue(this.stroke), 
             255*progress);
      strokeWeight(this.strokeWeight);
      fill(0, 0);
      ellipse(this.x, this.y, r);
    pop();

    if (millis() > this.endTime) {
      return true;
    }

    return false;
  }
}

class Sub {
  constructor(x, y, air) {
    this.x = x;
    this.y = y;
    this.air = air;
  }

  updateAir(n) {
    this.air -= n;
  }

  draw() {
    push();
      fill(80);
      stroke(0, 0, 255);
      rect(this.x, this.y, 100, 50)
      noStroke();
      fill(255);
      textSize(16);
      textAlign(CENTER);
      text("Air Supply: " + this.air, this.x+50, this.y);      
    pop();
  }
}

class Treasures {
  constructor(numCheap, numMid, numRare, x, y) {
    this.numCheap = numCheap;
    this.numMid = numMid;
    this.numRare = numRare;
    this.treasures = [];
    this.x = x;
    this.y = y;

  }

  createTreasures() {
    // try with 5
    var i = 0;
    for (i = 0; i < this.numCheap; i++) {
      // type 0 = fill(255, 255, 0)
      var c = 0;
      // var t = new Treasure((this.x - i*100), (this.y + i*25), getRandomInt(1, 3), c);
      var t = new Treasure((this.x - i*50), (this.y + i*15), getRandomInt(1, 3), c);
      this.treasures.push(t);
    }

    // try with 5
    var j = 0;
    for (j = 0; j < this.numCheap; j++) {
      // type 1 = fill(255, 165, 0)
      var c = 1;
      var t = new Treasure((this.x - 250 - j*50), (this.y + 75 + j*15), getRandomInt(4, 6), c);
      console.log(t);
      this.treasures.push(t);
    }

    var r = new Treasure((this.x - 400), (this.y + 165), getRandomInt(1,10), -1);
    this.treasures.push(r);
    // try with 7
    var k = 0
    for (k = 0; k < 8; k++) {
      // type 2 = fill(255, 69, 0)
      var c = 2;
      var t = new Treasure((this.x - 350 + k*50), (this.y + 180 + k*10), getRandomInt(7, 9), c);
      this.treasures.push(t);
    }

    var m = 0
    for (m = 0; m < 6; m++) {
      // type 2 = fill(255, 69, 0)
      var c = 1;
      var t = new Treasure((this.x + 50 + m*50), (this.y + 260 + m*10), getRandomInt(4, 6), c);
      this.treasures.push(t);
    }

    var n = 0
    for (n = 0; n < 4; n++) {
      // type 2 = fill(255, 69, 0)
      var c = 0;
      var t = new Treasure((this.x + 350 + n*50), (this.y + 320 + n*10), getRandomInt(1, 3), c);
      this.treasures.push(t);
    }

    var r2 = new Treasure((this.x + 550), (this.y + 370), getRandomInt(5, 18), -2);
    this.treasures.push(r2);        

    var l = 0
    for (l = 0; l < 7; l++) {
      // type 2 = fill(255, 69, 0)
      var c = 3;
      var t = new Treasure((this.x + 500 - l*50), (this.y + 400 + l*15), getRandomInt(13, 15), c);
      console.log(t);
      this.treasures.push(t);
    }    
  }

  draw() {
    this.treasures.forEach(t => t.draw());
  }
}

class Treasure {
  constructor(x, y, tvalue, tcolor) {
    this.x = x;
    this.y = y;
    this.tvalue = tvalue;
    this.tcolor = tcolor;
    this.taken = false;
    this.hasPlayer = false;
    this.showTreasureValue = false;
  }

  draw() {
    push();
      // fill(this.tcolor);
      if (this.taken == true) {
        fill(200);
      } else if (this.tcolor == 0) {
        // fill(255, 255, 0, 100);
        fill('#032642');
      } else if (this.tcolor == 1) {
        // fill(255, 165, 0, 100)
        fill('#06508A');
      } else if (this.tcolor == 2) {
        // fill(255, 69, 0, 100);
        fill('#0972C4');
      } else if (this.tcolor == 3) {
        fill('#389CD8'); 
      } else if (this.tcolor == -1) {
        fill(255, getRandomInt(200, 255), 0);
      } else if (this.tcolor == -2) {
        fill(0, 255, getRandomInt(1, 255));
      }
      ellipse(this.x, this.y, 40);
      if (this.showTreasureValue) {
        console.log('displaying treasure values');
        fill(255);
        noStroke();
        textSize(16);
        text(this.tvalue, this.x, this.y);
      }
    pop();
  }
}


function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min +1)) + min;
}