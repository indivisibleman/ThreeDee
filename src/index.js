'use strict';

import * as THREE from 'three';
import {
  TrackballControls
} from 'three/examples/jsm/controls/TrackballControls.js';

import './threedee.css';

/*
 * Parser
 */

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

    const parser = new Parser(event.target.result);
    console.log("Parser object, cave name: " + parser.readString());

    var labelBuffer = {
      label: []
    };
    var rawPoints = [];
    var lines = []
    var lineColours = [];
    var currentLine = -1;

    var stations = new Map();

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
        var newLine = [];
        var newLineColour = [];
        currentLine++;

        var x = readInteger(data);
        var y = readInteger(data);
        var z = readInteger(data);

        newLine.push(x, y, z);
        newLineColour.push(0, 0, 0);

        lines.push(newLine);
        lineColours.push(newLineColour);
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
        if ((code & 0x01) == 0x01) {
          //("above ground, ");
        }

        if ((code & 0x02) == 0x02) {
          //("duplicate, ");
        }

        if ((code & 0x04) == 0x04) {
          //("splay, ");
        }

        if ((code & 0x20) != 0x20) {
          processLabel(data, labelBuffer);
        }

        var x = readInteger(data);
        var y = readInteger(data);
        var z = readInteger(data);

        lines[currentLine].push(x, y, z);
        lineColours[currentLine].push(0, 0, 0);
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

    console.log(scale);
    console.log(lines);
    console.log(stations);
    console.log(crossSections);

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

    console.log(stationPoints);

    var lineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      linewidth: 1,
      linecap: 'round',
      linejoin: 'round'
    });

    //lines.forEach(line => {
    for (var leg = 0; leg < lines.length; leg++) {
      var line = lines[leg];
      var lineColour = lineColours[leg];

      for (var station = 0; station < line.length; station += 3) {
        var hue = ((line[station + 2] - negColour) / colourScale) * 0.66666667;

        var rgb = hslToRgb(0.66666667 - hue, 1, 0.5);

        lineColour[station] = rgb[0];
        lineColour[station + 1] = rgb[1];
        lineColour[station + 2] = rgb[2];
      }
    }

    for (var leg = 0; leg < lines.length; leg++) {
      var line = lines[leg];
      var lineColour = lineColours[leg];
      var lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(line, 3));
      lineGeometry.translate(-negX, -negY, -negZ);
      lineGeometry.scale(scale, scale, scale);
      lineGeometry.setAttribute('color', new THREE.Float32BufferAttribute(lineColour, 3));
      var lineData = new THREE.Line(lineGeometry, lineMaterial);
      scene.add(lineData);
    }
  });

  reader.readAsArrayBuffer(file);
}

const stationVisibilityCheckbox = document.getElementById('station-visibility');

stationVisibilityCheckbox.addEventListener('change', (event) => {
  stationPoints.visible = event.currentTarget.checked
});

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
