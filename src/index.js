'use strict';

import * as THREE from 'three';
import {
  TrackballControls
} from 'three/examples/jsm/controls/TrackballControls.js';

import './threedee.css';

/*
 * Parser
 */

/*
class Parser {
  constructor(rawData) {
    this.byteArray = new Uint8Array(rawData);
    this.cursor = 0;
  }

  readString() {
    var string = [];

    while (this.byteArray[this.cursor] != 0x0a) {
      string.push(this.byteArray[this.cursor++]);
    }

    this.cursor++;

    return String.fromCharCode.apply(null, string);
  }
}*/

class Position {
  x;
  y;
  z;

  constructor() {}

  setPosition(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
}

class Legs {
  constructor(previousPosition) {
    this.currentLeg = 0,
      this.legs = [
        [previousPosition.x, previousPosition.y, previousPosition.z]
      ];
  }

  addLine(previousPosition, currentPosition) {
    let length = this.legs[this.currentLeg].length;

    if (this.legs[this.currentLeg][length - 3] === previousPosition.x &&
      this.legs[this.currentLeg][length - 2] === previousPosition.y &&
      this.legs[this.currentLeg][length - 1] === previousPosition.z) {
      this.legs[this.currentLeg].push(currentPosition.x, currentPosition.y, currentPosition.z);
    } else {
      this.currentLeg += 1;

      this.legs[this.currentLeg] = [
        previousPosition.x,
        previousPosition.y,
        previousPosition.z,
        currentPosition.x,
        currentPosition.y,
        currentPosition.z
      ];
    }
  }

  getLegs() {
    return this.legs;
  }
}

/**
 * Converts an HSL color value to RGB. Conversion formula
 * adapted from http://en.wikipedia.org/wiki/HSL_color_space.
 * Assumes h, s, and l are contained in the set [0, 1] and
 * returns r, g, and b in the set [0, 1].
 *
 * @param   {number}  h       The hue
 * @param   {number}  s       The saturation
 * @param   {number}  l       The lightness
 * @return  {Array}           The RGB representation
 */
function hslToRgb(h, s, l) {
  var r, g, b;

  if (s == 0) {
    r = g = b = l; // achromatic
  } else {
    var hue2rgb = function hue2rgb(p, q, t) {
      if (t < 0) {
        t += 1
      };
      if (t > 1) {
        t -= 1
      };
      if (t < 1 / 6) {
        return p + (q - p) * 6 * t
      };
      if (t < 1 / 2) {
        return q
      };
      if (t < 2 / 3) {
        return p + (q - p) * (2 / 3 - t) * 6
      };
      return p;
    }

    var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    var p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [r, g, b];
}

var stationPoints;

var surfaceVisibility = true;
var undergroundVisibility = true;
var duplicateVisibility = true;
var splayVisibility = true;
var crossSectionVisibility = false;
var legData = new Map();
var crossSectionData = [];

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 900 / 600, 0.1, 10000);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(900, 600);
var container = document.getElementById('three-dee-map');
container.appendChild(renderer.domElement);

camera.position.z = 100;

let controls = new TrackballControls(camera, renderer.domElement);
controls.rotateSpeed = 1;
controls.zoomSpeed = 1.2;
controls.panSpeed = 0.8;

controls.keys = ['KeyA', 'KeyS', 'KeyD'];

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

animate();

//const shadowTexture = new THREE.CanvasTexture(  );

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
scene.add(directionalLight);

function readStringFrom(data) {
  var string = [];

  while (data.array[data.cursor] != 0x0a) {
    string.push(data.array[data.cursor++]);
  }

  data.cursor++;

  return String.fromCharCode.apply(null, string);
}

function hasNext(data) {
  return data.cursor < data.array.length;
}

function readByte(data) {
  return data.array[data.cursor++];
}

function moveCursor(data, distance) {
  data.cursor += distance;
}

function readInteger(data) {
  return data.array[data.cursor++] |
    data.array[data.cursor++] << 8 |
    data.array[data.cursor++] << 16 |
    data.array[data.cursor++] << 24;
}

function readIntegerTwoByte(data) {
  return data.array[data.cursor++] |
    data.array[data.cursor++] << 8;
}

function processLabel(data, labelBuffer) {
  var read = readByte(data);

  var deleteCount;
  var append;

  if (0x00 != read) {
    deleteCount = read >> 4 & 0x0f;
    append = read & 0x0f;
  } else {
    var readDelete = readByte(data);

    if (0xff != readDelete) {
      deleteCount = readDelete;
    } else {
      deleteCount = readInteger(data);
    }

    var readAppend = readByte(data);

    if (0xff != readAppend) {
      append = readAppend;
    } else {
      append = readInteger(data);
    }
  }

  for (var removal = 0; removal < deleteCount; removal++) {
    labelBuffer.label.pop();
  }

  for (var addition = 0; addition < append; addition++) {
    labelBuffer.label.push(readByte(data));
  }
}

function getLabel(labelBuffer) {
  return String.fromCharCode.apply(null, labelBuffer.label);
}

function readFile(file) {
  /* Clear existing surveys */
  if (stationPoints !== undefined) {
    stationPoints = undefined;
  }

  legData = new Map();

  while (scene.children.length > 0) {
    scene.remove(scene.children[0]);
  }

  // Check if the file is an image.
  if (file.name && !file.name.endsWith('.3d')) {
    console.log('File is not 3d.', file.name, file);
    return;
  }

  const reader = new FileReader();

  reader.addEventListener('load', (event) => {
    var data = {
      array: new Uint8Array(event.target.result),
      cursor: 0
    };

    /*const parser = new Parser(event.target.result);
    console.log("Parser object, cave name: " + parser.readString());*/

    var previousPosition = new Position();
    var currentPosition = new Position();

    var labelBuffer = {
      label: []
    };
    var rawPoints = [];

    var legs = new Map();

    var stations = new Map();

    crossSectionData = [];

    var crossSections = [];
    var currentCrossSection = 0;

    var name = readStringFrom(data);
    var version = readStringFrom(data);
    var metadata = readStringFrom(data);
    var timestamp = readStringFrom(data);

    var style;

    while (hasNext(data)) {
      var code = readByte(data);

      if (0x00 == code) {
        if ('NORMAL' === style) {
          //break;
        } else {
          style = 'NORMAL';
        }
      } else if (0x01 == code) {
        style = 'DIVING';
      } else if (0x02 == code) {
        style = 'CARTESIAN';
      } else if (0x03 == code) {
        style = 'CYLPOLAR';
      } else if (0x04 == code) {
        style = 'NOSURVEY';
      } else if (0x05 <= code && 0x0e >= code) {
        console.log("Reserved code: " + code);
      } else if (0x0f == code) {
        // Move
        var x = readInteger(data);
        var y = readInteger(data);
        var z = readInteger(data);

        previousPosition.setPosition(x, y, z);
      } else if (0x10 == code) {
        //TODO: no date data
      } else if (0x11 == code) {
        //TODO: date 2 byte number of days since 1900
        moveCursor(data, 2);
      } else if (0x12 == code) {
        //TODO: date and date span, 2 byte number of days since 1900, unsigned byte number of days since date
        moveCursor(data, 3);
      } else if (0x13 == code) {
        //TODO: date and date, 2 2 byte number of days since 1900
        moveCursor(data, 4);
      } else if (0x14 <= code && 0x1e >= code) {
        console.log("Reserved code: " + code);
      } else if (0x1f == code) {
        //TODO: error
        moveCursor(data, 20);
      } else if (0x20 <= code && 0x2f >= code) {
        console.log("Reserved code: " + code);
      } else if (0x30 <= code && 0x31 >= code) {
        //TODO: cross section, label and 2 byte LRUDs
        if (crossSections[currentCrossSection] === undefined) {
          crossSections[currentCrossSection] = [];
        }

        let crossSection = crossSections[currentCrossSection];

        processLabel(data, labelBuffer);
        var left = readIntegerTwoByte(data);
        var right = readIntegerTwoByte(data);
        var up = readIntegerTwoByte(data);
        var down = readIntegerTwoByte(data);

        crossSection.push([getLabel(labelBuffer), left, right, up, down]);

        if ((code & 0x01) == 0x01) {
          currentCrossSection++;
        }
      } else if (0x32 <= code && 0x33 >= code) {
        //TODO: cross section, label and 4 byte LRUDs
        if (crossSections[currentCrossSection] === undefined) {
          crossSections[currentCrossSection] = [];
        }

        let crossSection = crossSections[currentCrossSection];

        processLabel(data, labelBuffer);
        var left = readInteger(data);
        var right = readInteger(data);
        var up = readInteger(data);
        var down = readInteger(data);

        crossSection.push([getLabel(labelBuffer), left, right, up, down]);

        if ((code & 0x01) == 0x01) {
          currentCrossSection++;
        }
      } else if (0x34 <= code && 0x3f >= code) {
        console.log("Reserved code: " + code);
      } else if (0x40 <= code && 0x7f >= code) {
        //TODO: line, label and 4 byte x, y, z

        var key = JSON.stringify({
          underground: (code & 0x01) != 0x01,
          duplicate: (code & 0x02) == 0x02,
          splay: (code & 0x04) == 0x04
        });

        if (!legs.has(key)) {
          legs.set(key, new Legs(previousPosition));
        }

        var leg = legs.get(key);

        if ((code & 0x20) != 0x20) {
          processLabel(data, labelBuffer);
        }

        var x = readInteger(data);
        var y = readInteger(data);
        var z = readInteger(data);

        currentPosition.setPosition(x, y, z);

        leg.addLine(previousPosition, currentPosition);

        previousPosition.setPosition(x, y, z);
      } else if (0x80 <= code && 0xff >= code) {
        //TODO: label, label and 4 byte x, y, z
        if ((code & 0x01) == 0x01) {
          //("above ground, ");
        }

        if ((code & 0x02) == 0x02) {
          //("underground, ");
        }

        if ((code & 0x04) == 0x04) {
          //("entrance, ");
        }

        if ((code & 0x08) == 0x08) {
          //("exported, ");
        }

        if ((code & 0x10) == 0x10) {
          //("fixed, ");
        }

        if ((code & 0x20) == 0x20) {
          //("anonymous, ");
        }

        if ((code & 0x40) == 0x40) {
          //("on wall, ");
        }

        processLabel(data, labelBuffer);
        var x = readInteger(data);
        var y = readInteger(data);
        var z = readInteger(data);

        rawPoints.push([x, y, z]);
        stations.set(getLabel(labelBuffer), [x, y, z]);
      } else {
        console.log("Unhandled code: " + code);
      }
    }

    var minX = Infinity;
    var minY = Infinity;
    var minZ = Infinity;

    var maxX = -Infinity;
    var maxY = -Infinity;
    var maxZ = -Infinity;

    rawPoints.forEach(item => {
      minX = Math.min(minX, item[0]);
      minY = Math.min(minY, item[1]);
      minZ = Math.min(minZ, item[2]);

      maxX = Math.max(maxX, item[0]);
      maxY = Math.max(maxY, item[1]);
      maxZ = Math.max(maxZ, item[2]);
    });

    var scale = 150 / Math.max(maxX - minX, maxY - minY, maxZ - minZ);
    var negX = (maxX + minX) * 0.5;
    var negY = (maxY + minY) * 0.5;
    var negZ = (maxZ + minZ) * 0.5;

    var negColour = minZ;
    var colourScale = maxZ - minZ;

    var newPoints = [];

    rawPoints.forEach(item => {
      newPoints.push(item[0], item[1], item[2]);
    });

    var newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPoints, 3));
    newGeometry.translate(-negX, -negY, -negZ);
    newGeometry.scale(scale, scale, scale);
    var newMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 2.0,
      sizeAttenuation: false
    });

    stationPoints = new THREE.Points(newGeometry, newMaterial);
    stationPoints.visible = false;
    scene.add(stationPoints);

    var lineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      linewidth: 1,
      linecap: 'round',
      linejoin: 'round'
    });

    var dashedLineMaterial = new THREE.LineDashedMaterial({
      vertexColors: true,
      dashSize: 0.4,
      gapSize: 0.2,
      linewidth: 1,
      linecap: 'round',
      linejoin: 'round'
    });

    legs.forEach((value, key) => {
      let legs = value.getLegs();
      let legProperties = JSON.parse(key);

      for (var leg = 0; leg < legs.length; leg++) {
        let line = legs[leg];
        let lineColour = [];

        for (var station = 0; station < line.length; station += 3) {
          var hue = ((line[station + 2] - negColour) / colourScale) * 0.66666667;

          var rgb = hslToRgb(0.66666667 - hue, 1, 0.5);

          lineColour.push(rgb[0], rgb[1], rgb[2]);
        }

        var lineGeometry = new THREE.BufferGeometry();
        lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(line, 3));
        lineGeometry.translate(-negX, -negY, -negZ);
        lineGeometry.scale(scale, scale, scale);
        lineGeometry.setAttribute('color', new THREE.Float32BufferAttribute(lineColour, 3));

        var lineData;

        if (legProperties.duplicate) {
          lineData = new THREE.Line(lineGeometry, dashedLineMaterial);
          lineData.computeLineDistances();
        } else {
          lineData = new THREE.Line(lineGeometry, lineMaterial);
        }

        if (!legData.has(key)) {
          legData.set(key, []);
        }

        legData.get(key).push(lineData);

        scene.add(lineData);
      }
    });

    updateVisibility();

    crossSections.forEach((crossSection) => {
      let length = crossSection.length;

      var geometry = new THREE.BufferGeometry();

      let faces = [];
      let colours = [];

      let v1, v2, v3, v4, v5, v6, v7, v8, v9, v10, v11, v12;
      let previousUp, previousDown;

      for (let station = 0; station < crossSection.length; station++) {
        let up = stations.get(crossSection[station][0])[2] + crossSection[station][3];
        let down = stations.get(crossSection[station][0])[2] - crossSection[station][4];
        let left = [stations.get(crossSection[station][0])[0], stations.get(crossSection[station][0])[1]];
        let right = [stations.get(crossSection[station][0])[0], stations.get(crossSection[station][0])[1]];

        if (station == 0) {
          let x = stations.get(crossSection[station + 1][0])[0] - stations.get(crossSection[station][0])[0];
          let y = stations.get(crossSection[station + 1][0])[1] - stations.get(crossSection[station][0])[1];

          let legLength = Math.sqrt((x * x) + (y * y));

          if (legLength !== 0) {
            x /= legLength;
            y /= legLength;
          }

          let leftOffset = [crossSection[station][1] * -y, crossSection[station][1] * x];
          let rightOffset = [crossSection[station][2] * y, crossSection[station][2] * -x];

          left[0] += leftOffset[0];
          left[1] += leftOffset[1];
          right[0] += rightOffset[0];
          right[1] += rightOffset[1];

          v1 = [left[0], left[1], up];
          v2 = [left[0], left[1], down];
          v3 = [right[0], right[1], up];
          v4 = [right[0], right[1], down];

          // End cap
          faces = faces.concat(v1);
          faces = faces.concat(v2);
          faces = faces.concat(v3);

          faces = faces.concat(v3);
          faces = faces.concat(v2);
          faces = faces.concat(v4);

          colours = colours.concat(colour(up, negColour, colourScale));
          colours = colours.concat(colour(down, negColour, colourScale));
          colours = colours.concat(colour(up, negColour, colourScale));

          colours = colours.concat(colour(up, negColour, colourScale));
          colours = colours.concat(colour(down, negColour, colourScale));
          colours = colours.concat(colour(down, negColour, colourScale));

          previousUp = up;
          previousDown = down;
        } else if (station < crossSection.length - 2) {
          let x1 = stations.get(crossSection[station + 1][0])[0] - stations.get(crossSection[station][0])[0];
          let y1 = stations.get(crossSection[station + 1][0])[1] - stations.get(crossSection[station][0])[1];

          let legLength1 = Math.sqrt((x1 * x1) + (y1 * y1));

          if (legLength1 !== 0) {
            x1 /= legLength1;
            y1 /= legLength1;
          }

          let x2 = stations.get(crossSection[station][0])[0] - stations.get(crossSection[station - 1][0])[0];
          let y2 = stations.get(crossSection[station][0])[1] - stations.get(crossSection[station - 1][0])[1];

          let legLength2 = Math.sqrt((x2 * x2) + (y2 * y2));

          if (legLength2 !== 0) {
            x2 /= legLength2;
            y2 /= legLength2;
          }

          let x = x1 + x2;
          let y = y1 + y2;

          let legLength = Math.sqrt((x * x) + (y * y));

          if (legLength !== 0) {
            x /= legLength;
            y /= legLength;
          }

          let leftOffset = [crossSection[station][1] * -y, crossSection[station][1] * x];
          let rightOffset = [crossSection[station][2] * y, crossSection[station][2] * -x];

          left[0] += leftOffset[0];
          left[1] += leftOffset[1];
          right[0] += rightOffset[0];
          right[1] += rightOffset[1];

          v5 = [left[0], left[1], up];
          v6 = [left[0], left[1], down];
          v7 = [right[0], right[1], up];
          v8 = [right[0], right[1], down];

          // Top face
          faces = faces.concat(v1);
          faces = faces.concat(v3);
          faces = faces.concat(v5);

          faces = faces.concat(v3);
          faces = faces.concat(v7);
          faces = faces.concat(v5);

          colours = colours.concat(colour(previousUp, negColour, colourScale));
          colours = colours.concat(colour(previousUp, negColour, colourScale));
          colours = colours.concat(colour(up, negColour, colourScale));

          colours = colours.concat(colour(previousUp, negColour, colourScale));
          colours = colours.concat(colour(up, negColour, colourScale));
          colours = colours.concat(colour(up, negColour, colourScale));

          // Right face
          faces = faces.concat(v3);
          faces = faces.concat(v4);
          faces = faces.concat(v7);

          faces = faces.concat(v4);
          faces = faces.concat(v8);
          faces = faces.concat(v7);

          colours = colours.concat(colour(previousUp, negColour, colourScale));
          colours = colours.concat(colour(previousDown, negColour, colourScale));
          colours = colours.concat(colour(up, negColour, colourScale));

          colours = colours.concat(colour(previousDown, negColour, colourScale));
          colours = colours.concat(colour(down, negColour, colourScale));
          colours = colours.concat(colour(up, negColour, colourScale));

          // Bottom face
          faces = faces.concat(v6);
          faces = faces.concat(v8);
          faces = faces.concat(v4);

          faces = faces.concat(v6);
          faces = faces.concat(v4);
          faces = faces.concat(v2);

          colours = colours.concat(colour(down, negColour, colourScale));
          colours = colours.concat(colour(down, negColour, colourScale));
          colours = colours.concat(colour(previousDown, negColour, colourScale));

          colours = colours.concat(colour(down, negColour, colourScale));
          colours = colours.concat(colour(previousDown, negColour, colourScale));
          colours = colours.concat(colour(previousDown, negColour, colourScale));

          // Left face
          faces = faces.concat(v5);
          faces = faces.concat(v2);
          faces = faces.concat(v1);

          faces = faces.concat(v5);
          faces = faces.concat(v6);
          faces = faces.concat(v2);

          colours = colours.concat(colour(up, negColour, colourScale));
          colours = colours.concat(colour(previousDown, negColour, colourScale));
          colours = colours.concat(colour(previousUp, negColour, colourScale));

          colours = colours.concat(colour(up, negColour, colourScale));
          colours = colours.concat(colour(down, negColour, colourScale));
          colours = colours.concat(colour(previousDown, negColour, colourScale));

          v1 = v5;
          v2 = v6;
          v3 = v7;
          v4 = v8;

          previousUp = up;
          previousDown = down;
        } else {
          let x = stations.get(crossSection[station][0])[0] - stations.get(crossSection[station - 1][0])[0];
          let y = stations.get(crossSection[station][0])[1] - stations.get(crossSection[station - 1][0])[1];

          let legLength = Math.sqrt((x * x) + (y * y));

          if (legLength !== 0) {
            x /= legLength;
            y /= legLength;
          }

          let leftOffset = [crossSection[station][1] * -y, crossSection[station][1] * x];
          let rightOffset = [crossSection[station][2] * y, crossSection[station][2] * -x];

          left[0] += leftOffset[0];
          left[1] += leftOffset[1];
          right[0] += rightOffset[0];
          right[1] += rightOffset[1];

          v5 = [left[0], left[1], up];
          v6 = [left[0], left[1], down];
          v7 = [right[0], right[1], up];
          v8 = [right[0], right[1], down];

          // Top face
          faces = faces.concat(v1);
          faces = faces.concat(v3);
          faces = faces.concat(v5);

          faces = faces.concat(v3);
          faces = faces.concat(v7);
          faces = faces.concat(v5);

          colours = colours.concat(colour(previousUp, negColour, colourScale));
          colours = colours.concat(colour(previousUp, negColour, colourScale));
          colours = colours.concat(colour(up, negColour, colourScale));

          colours = colours.concat(colour(previousUp, negColour, colourScale));
          colours = colours.concat(colour(up, negColour, colourScale));
          colours = colours.concat(colour(up, negColour, colourScale));

          // Right face
          faces = faces.concat(v3);
          faces = faces.concat(v4);
          faces = faces.concat(v7);

          faces = faces.concat(v4);
          faces = faces.concat(v8);
          faces = faces.concat(v7);

          colours = colours.concat(colour(previousUp, negColour, colourScale));
          colours = colours.concat(colour(previousDown, negColour, colourScale));
          colours = colours.concat(colour(up, negColour, colourScale));

          colours = colours.concat(colour(previousDown, negColour, colourScale));
          colours = colours.concat(colour(down, negColour, colourScale));
          colours = colours.concat(colour(up, negColour, colourScale));

          // Bottom face
          faces = faces.concat(v6);
          faces = faces.concat(v8);
          faces = faces.concat(v4);

          faces = faces.concat(v6);
          faces = faces.concat(v4);
          faces = faces.concat(v2);

          colours = colours.concat(colour(down, negColour, colourScale));
          colours = colours.concat(colour(down, negColour, colourScale));
          colours = colours.concat(colour(previousDown, negColour, colourScale));

          colours = colours.concat(colour(down, negColour, colourScale));
          colours = colours.concat(colour(previousDown, negColour, colourScale));
          colours = colours.concat(colour(previousDown, negColour, colourScale));

          // Left Face
          faces = faces.concat(v5);
          faces = faces.concat(v2);
          faces = faces.concat(v1);

          faces = faces.concat(v5);
          faces = faces.concat(v6);
          faces = faces.concat(v2);

          colours = colours.concat(colour(up, negColour, colourScale));
          colours = colours.concat(colour(previousDown, negColour, colourScale));
          colours = colours.concat(colour(previousUp, negColour, colourScale));

          colours = colours.concat(colour(up, negColour, colourScale));
          colours = colours.concat(colour(down, negColour, colourScale));
          colours = colours.concat(colour(previousDown, negColour, colourScale));

          // End cap
          faces = faces.concat(v7);
          faces = faces.concat(v8);
          faces = faces.concat(v5);

          faces = faces.concat(v8);
          faces = faces.concat(v6);
          faces = faces.concat(v5);

          colours = colours.concat(colour(up, negColour, colourScale));
          colours = colours.concat(colour(down, negColour, colourScale));
          colours = colours.concat(colour(up, negColour, colourScale));

          colours = colours.concat(colour(down, negColour, colourScale));
          colours = colours.concat(colour(down, negColour, colourScale));
          colours = colours.concat(colour(up, negColour, colourScale));
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(faces, 3));
        geometry.translate(-negX, -negY, -negZ);
        geometry.scale(scale, scale, scale);
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3));

        let crossSectionDatum = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
          vertexColors: true
        }));

        crossSectionData.push(crossSectionDatum);

        scene.add(crossSectionDatum);
      }
    });

    updateCrossSectionVisiblity();
  });

  reader.readAsArrayBuffer(file);
}

function colour(height, negColour, colourScale) {
  var hue = ((height - negColour) / colourScale) * 0.66666667;

  return hslToRgb(0.66666667 - hue, 1, 0.5);
}

const stationVisibilityCheckbox = document.getElementById('station-visibility');

stationVisibilityCheckbox.addEventListener('change', (event) => {
  stationPoints.visible = event.currentTarget.checked
});

const surfaceVisibilityCheckbox = document.getElementById('surface-visibility');

surfaceVisibilityCheckbox.addEventListener('change', (event) => {
  surfaceVisibility = event.currentTarget.checked;
  updateVisibility();
});

const undergroundVisibilityCheckbox = document.getElementById('underground-visibility');

undergroundVisibilityCheckbox.addEventListener('change', (event) => {
  undergroundVisibility = event.currentTarget.checked;
  updateVisibility();
});

const duplicateVisibilityCheckbox = document.getElementById('duplicate-visibility');

duplicateVisibilityCheckbox.addEventListener('change', (event) => {
  duplicateVisibility = event.currentTarget.checked;
  updateVisibility();
});

const splayVisibilityCheckbox = document.getElementById('splay-visibility');

splayVisibilityCheckbox.addEventListener('change', (event) => {
  splayVisibility = event.currentTarget.checked;
  updateVisibility();
});

function updateVisibility() {
  legData.forEach((legs, key) => {
    let legProperties = JSON.parse(key);

    let visible = true;

    if (legProperties.underground) {
      visible = visible && undergroundVisibility;
    } else {
      visible = visible && surfaceVisibility;
    }

    if (legProperties.duplicate) {
      visible = visible && duplicateVisibility;
    }

    if (legProperties.splay) {
      visible = visible && splayVisibility;
    }

    legs.forEach((leg) => {
      leg.visible = visible;
    });

  });
}

const crossSectionVisibilityCheckbox = document.getElementById('cross-section-visibility');

crossSectionVisibilityCheckbox.addEventListener('change', (event) => {
  crossSectionVisibility = event.currentTarget.checked;
  updateCrossSectionVisiblity();
});

function updateCrossSectionVisiblity() {
  crossSectionData.forEach((crossSectionDatum) => {
    crossSectionDatum.visible = crossSectionVisibility;
  });

}

const dropZone = document.getElementById('drop-zone');

dropZone.addEventListener('dragover', (event) => {
  event.stopPropagation();
  event.preventDefault();
  // Style the drag-and-drop as a "copy file" operation.
  event.dataTransfer.dropEffect = 'copy';
});

dropZone.addEventListener('drop', (event) => {
  event.stopPropagation();
  event.preventDefault();
  const fileList = event.dataTransfer.files;
  console.log(fileList);
  for (const file of fileList) {
    readFile(file);
  }
});
