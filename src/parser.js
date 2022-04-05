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
