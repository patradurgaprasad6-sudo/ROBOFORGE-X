/*
  ROBOFORGE X - 6-servo Arduino starter
  Hardware note:
  - Example only. Servo pin assignments and power must be checked for your board.
  - Use an external regulated servo supply with common ground.
  - Do not power multiple servos from the Arduino 5V pin.
  - Validate mechanical limits before attaching a real mechanism.
*/
#include <Servo.h>

const byte SERVO_COUNT = 6;
const byte servoPins[SERVO_COUNT] = {3, 5, 6, 9, 10, 11};
Servo axes[SERVO_COUNT];
int targetAngles[SERVO_COUNT] = {90, 70, 125, 90, 90, 90};

void setup() {
  Serial.begin(115200);
  for (byte i = 0; i < SERVO_COUNT; i++) {
    axes[i].attach(servoPins[i]);
    axes[i].write(90);
  }
  Serial.println("ROBOFORGE X servo demo ready. Send six comma-separated angles.");
}

void loop() {
  if (Serial.available()) {
    String line = Serial.readStringUntil('\n');
    int start = 0;
    for (byte i = 0; i < SERVO_COUNT; i++) {
      int comma = line.indexOf(',', start);
      String token = (comma == -1) ? line.substring(start) : line.substring(start, comma);
      if (token.length()) targetAngles[i] = constrain(token.toInt(), 0, 180);
      if (comma == -1) break;
      start = comma + 1;
    }
    for (byte i = 0; i < SERVO_COUNT; i++) axes[i].write(targetAngles[i]);
    Serial.println("Command applied. Confirm the physical workspace is clear.");
  }
}
