'use strict';

import * as THREE from 'three';
import {
  TrackballControls
} from 'three/examples/jsm/controls/TrackballControls.js';

import './threedee.css';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 640 / 480, 0.1, 10000);

const renderer = new THREE.WebGLRenderer();
renderer.setSize(640, 480);
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

  console.log(String.fromCharCode.apply(null, labelBuffer.label));
}

function readFile(file) {
  // Check if the file is an image.
  if (file.name && !file.name.endsWith('.3d')) {
    console.log('File is not 3d.', file.name, file);
    return;
  }

  const reader = new FileReader();

  reader.addEventListener('load', (event) => {
    var arrayBuffer = event.target.result;
    var data = {
      array: new Uint8Array(arrayBuffer),
      cursor: 0
    };
    var labelBuffer = {
      label: []
    };
    var rawPoints = [];
    var lines = []
    var lineColours = [];
    var currentLine = -1;

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
        console.log("Move");
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
        console.log("No date");
      } else if (0x11 == code) {
        //TODO: date 2 byte number of days since 1900
        console.log("Two byte date");
        moveCursor(data, 2);
      } else if (0x12 == code) {
        //TODO: date and date span, 2 byte number of days since 1900, unsigned byte number of days since date
        console.log("Two byte date and span");
        moveCursor(data, 3);
      } else if (0x13 == code) {
        //TODO: date and date, 2 2 byte number of days since 1900
        console.log("Two byte date start and end");
        moveCursor(data, 4);
      } else if (0x14 <= code && 0x1e >= code) {
        console.log("Reserved code: " + code);
      } else if (0x1f == code) {
        //TODO: error
        console.log("Error");
        moveCursor(data, 20);
      } else if (0x20 <= code && 0x2f >= code) {
        console.log("Reserved code: " + code);
      } else if (0x30 <= code && 0x31 >= code) {
        //TODO: cross section, label and 2 byte LRUDs
        console.log("Cross section data: " + code);
        if ((code & 0x01) == 0x01) {
          console.log("last station, ");
        }
        processLabel(data, labelBuffer);
        console.log("L: " + readIntegerTwoByte(data) + " R: " + readIntegerTwoByte(data) + " U: " + readIntegerTwoByte(data) + " D: " + readIntegerTwoByte(data));
      } else if (0x32 <= code && 0x33 >= code) {
        //TODO: cross section, label and 4 byte LRUDs
        console.log("Cross section data: " + code);
        if ((code & 0x01) == 0x01) {
          console.log("last station, ");
        }
        processLabel(data, labelBuffer);
        console.log("L: " + readInteger(data) + " R: " + readInteger(data) + " U: " + readInteger(data) + " D: " + readInteger(data));
      } else if (0x34 <= code && 0x3f >= code) {
        console.log("Reserved code: " + code);
      } else if (0x40 <= code && 0x7f >= code) {
        //TODO: line, label and 4 byte x, y, z
        console.log("Line data: " + code);
        if ((code & 0x01) == 0x01) {
          console.log("above ground, ");
        }

        if ((code & 0x02) == 0x02) {
          console.log("duplicate, ");
        }

        if ((code & 0x04) == 0x04) {
          console.log("splay, ");
        }

        if ((code & 0x20) == 0x20) {
          console.log("don't read label, ");
        } else {
          processLabel(data, labelBuffer);
        }

        var x = readInteger(data);
        var y = readInteger(data);
        var z = readInteger(data);

        lines[currentLine].push(x, y, z);
        lineColours[currentLine].push(0, 0, 0);
      } else if (0x80 <= code && 0xff >= code) {
        //TODO: label, label and 4 byte x, y, z
        console.log("Label data: " + code);
        if ((code & 0x01) == 0x01) {
          console.log("above ground, ");
        }

        if ((code & 0x02) == 0x02) {
          console.log("underground, ");
        }

        if ((code & 0x04) == 0x04) {
          console.log("entrance, ");
        }

        if ((code & 0x08) == 0x08) {
          console.log("exported, ");
        }

        if ((code & 0x10) == 0x10) {
          console.log("fixed, ");
        }

        if ((code & 0x20) == 0x20) {
          console.log("anonymous, ");
        }

        if ((code & 0x40) == 0x40) {
          console.log("on wall, ");
        }

        processLabel(data, labelBuffer);
        var x = readInteger(data);
        var y = readInteger(data);
        var z = readInteger(data);

        rawPoints.push([x, y, z]);
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

    var scale = 200 / Math.max(maxX - minX, maxY - minY, maxZ - minZ);
    var negX = minX + ((maxX - minX) * 0.5);
    var negY = minY + ((maxY - minY) * 0.5);
    var negZ = minZ + ((maxZ - minZ) * 0.5);

    var negColour = minZ;
    var colourScale = maxZ - minZ;

    var newPoints = [];

    rawPoints.forEach(item => {
      newPoints.push((item[0] - negX) * scale, (item[1] - negY) * scale, (item[2] - negZ) * scale);
    });

    var newGeometry = new THREE.BufferGeometry();
    newGeometry.setAttribute('position', new THREE.Float32BufferAttribute(newPoints, 3));
    var newMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 2.0,
      sizeAttenuation: false
    });

    var stations = new THREE.Points(newGeometry, newMaterial);
    scene.add(stations);

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
        var colour = (line[station + 2] - negColour) / colourScale;

        lineColour[station] = colour;
        lineColour[station + 1] = 1 - colour;
        lineColour[station + 2] = 1;

        line[station] = (line[station] - negX) * scale;
        line[station + 1] = (line[station + 1] - negY) * scale;
        line[station + 2] = (line[station + 2] - negZ) * scale;
      }
    }

    for (var leg = 0; leg < lines.length; leg++) {
      var line = lines[leg];
      var lineColour = lineColours[leg];
      var lineGeometry = new THREE.BufferGeometry();
      lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(line, 3));
      lineGeometry.setAttribute('color', new THREE.Float32BufferAttribute(lineColour, 3));
      var lineData = new THREE.Line(lineGeometry, lineMaterial);
      scene.add(lineData);
    }
  });

  reader.readAsArrayBuffer(file);
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
