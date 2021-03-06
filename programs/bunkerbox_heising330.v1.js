var _ = require("underscore");
var si = require("./../sensor_interface.js");
var pcduino = require("pcduino");
var digital = pcduino.digital;
var sensor_interface;

var tuningMode = false;
var pumpChannel = 0;
var mainHeaterChannel = 0;
var preHeaterChannel = 0;
var preHeaterCVMin;
var preHeaterCVMax;
var mainHeaterCVMin;
var mainHeaterCVMax;
var currentPreHeaterPower = 0;
var currentMainHeaterPower = 0;
var sumpTempSensorMappings = {};
var started = false;
var feedstockDepletionCount = 0;

createPhysicalComponentForSubsensor = function (node330, sensorName, valueType) {
    return node330.createPhysicalComponentWithValueFunction(valueType, function () {
        return sensor_interface.getSensorValue(sensorName);
    });
};

module.exports.setup = function (node330, startTime, switch1, config, calculatedPreheaterSetPoint, floatSwitch, startStopSwitch, enableRunSwitch, headsTemp, preHeaterTemp, heartsTemp, tailsTemp, intermediateTemp, sumpTempPrimarySensor, calculatedSumpTemp, ambientTemp, ambientPressure, preHeaterPID, mainHeaterPID, headsSetPoint, tailsSetPoint, headsSetPointScale, tailsSetPointScale, mainHeaterSetPointOffset, pumpFlowRate, preHeaterPower, mainHeaterPower, mainHeaterPGain, mainHeaterIGain, mainHeaterDGain, preHeaterPGain, preHeaterIGain, preHeaterDGain, mainHeaterIntegral, preHeaterIntegral, operationState) {

    sensor_interface = new si(node330);

    digital.pinMode(config.getSetting("float_switch_pin"), digital.INPUT_PU);

    tuningMode = config.getSetting("tuning_mode", true);

    mainHeaterChannel = config.getSetting("mainHeaterChannel");
    preHeaterChannel = config.getSetting("preHeaterChannel");
    pumpChannel = config.getSetting("pumpChannel");

    // Set all of our sensors to proper units
    calculatedPreheaterSetPoint.setValueType(node330.valueTypes.TEMP_IN_F);
    headsTemp.setValueType(node330.valueTypes.TEMP_IN_F);
    preHeaterTemp.setValueType(node330.valueTypes.TEMP_IN_F);
    heartsTemp.setValueType(node330.valueTypes.TEMP_IN_F);
    tailsTemp.setValueType(node330.valueTypes.TEMP_IN_F);
    intermediateTemp.setValueType(node330.valueTypes.TEMP_IN_F);

    // Setup our sump temps
    var sumpTempSensorCount = config.getSetting("sump_temp_sensor_count", 7);
    for (var index = 1; index <= sumpTempSensorCount; index++) {
        var sensorName = "sumpTemp" + index;
        var sumpTempComponent = node330.createVirtualComponent(sensorName, node330.valueTypes.TEMP_IN_F);
        node330.exposeVirtualComponentToViewers(sumpTempComponent);

        var sensorMappingSetting = config.getSetting(sensorName + "_sensor");

        if (sensorMappingSetting) {
            sumpTempSensorMappings[sensorMappingSetting] = sumpTempComponent;
        }
    }

    sumpTempPrimarySensor.setValueType(node330.valueTypes.STRING);
    sumpTempPrimarySensor.setValue("");
    calculatedSumpTemp.setValueType(node330.valueTypes.TEMP_IN_F);
    ambientTemp.setValueType(node330.valueTypes.TEMP_IN_F);
    ambientPressure.setValueType(node330.valueTypes.PRES_IN_MBAR);
    headsSetPoint.setValueType(node330.valueTypes.TEMP_IN_F);
    tailsSetPoint.setValueType(node330.valueTypes.TEMP_IN_F);
    pumpFlowRate.setValueType(node330.valueTypes.RATE_IN_GALLONS_PER_HOUR);
    preHeaterPower.setValueType(node330.valueTypes.PERCENT);
    mainHeaterPower.setValueType(node330.valueTypes.PERCENT);
    operationState.setValueType(node330.valueTypes.STRING);
    startTime.setValueType(node330.valueTypes.STRING);

    // Set any initial values
    startStopSwitch.setValue(false);
    enableRunSwitch.setValue(false);
    mainHeaterSetPointOffset.setValue(config.getSetting("main_heater_setpoint_offset"));
    pumpFlowRate.setValue(config.getSetting("default_pump_flow_rate_gph"));
    mainHeaterPGain.setValue(config.getSetting("main_heater_p_gain"));
    mainHeaterIGain.setValue(config.getSetting("main_heater_i_gain"));
    mainHeaterDGain.setValue(config.getSetting("main_heater_d_gain"));
    preHeaterPGain.setValue(config.getSetting("pre_heater_p_gain"));
    preHeaterIGain.setValue(config.getSetting("pre_heater_i_gain"));
    preHeaterDGain.setValue(config.getSetting("pre_heater_d_gain"));
    headsSetPoint.setValue(config.getSetting("default_heads_set_point"));
    tailsSetPoint.setValue(config.getSetting("default_tails_set_point"));
    headsSetPointScale.setValue(config.getSetting("pre_heater_heads_set_point_scale"));
    tailsSetPointScale.setValue(config.getSetting("main_heater_tails_set_point_scale"));

    // Expose our values to the web viewer
    node330.exposeVirtualComponentToViewers(startStopSwitch, false);
    node330.exposeVirtualComponentToViewers(enableRunSwitch, false);
    node330.exposeVirtualComponentToViewers(operationState);
    node330.exposeVirtualComponentToViewers(floatSwitch);
    node330.exposeVirtualComponentToViewers(calculatedPreheaterSetPoint);

    if (tuningMode) {
        node330.exposeVirtualComponentToViewers(mainHeaterSetPointOffset, false);
        node330.exposeVirtualComponentToViewers(mainHeaterPGain, false);
        node330.exposeVirtualComponentToViewers(mainHeaterIGain, false);
        node330.exposeVirtualComponentToViewers(mainHeaterDGain, false);
        node330.exposeVirtualComponentToViewers(mainHeaterIntegral, false);

        node330.exposeVirtualComponentToViewers(preHeaterPGain, false);
        node330.exposeVirtualComponentToViewers(preHeaterIGain, false);
        node330.exposeVirtualComponentToViewers(preHeaterDGain, false);
        node330.exposeVirtualComponentToViewers(preHeaterIntegral, false);

        node330.exposeVirtualComponentToViewers(headsSetPoint, false);
        node330.exposeVirtualComponentToViewers(tailsSetPoint, false);
        node330.exposeVirtualComponentToViewers(pumpFlowRate, false);
        node330.exposeVirtualComponentToViewers(headsSetPointScale, false);
        node330.exposeVirtualComponentToViewers(tailsSetPointScale, false);
    }

    node330.exposeVirtualComponentToViewers(headsTemp);
    node330.exposeVirtualComponentToViewers(preHeaterTemp);
    node330.exposeVirtualComponentToViewers(heartsTemp);
    node330.exposeVirtualComponentToViewers(tailsTemp);
    node330.exposeVirtualComponentToViewers(intermediateTemp);
    node330.exposeVirtualComponentToViewers(sumpTempPrimarySensor, false);
    node330.exposeVirtualComponentToViewers(calculatedSumpTemp);
    node330.exposeVirtualComponentToViewers(ambientTemp);
    node330.exposeVirtualComponentToViewers(ambientPressure);
    node330.exposeVirtualComponentToViewers(preHeaterPower);
    node330.exposeVirtualComponentToViewers(mainHeaterPower);
    node330.exposeVirtualComponentToViewers(startTime);

    preHeaterCVMin = config.getSetting("pre_heater_cv_min");
    preHeaterCVMax = config.getSetting("pre_heater_cv_max");
    mainHeaterCVMin = config.getSetting("main_heater_cv_min");
    mainHeaterCVMax = config.getSetting("main_heater_cv_max");

    // Setup our pre heater PID
    preHeaterPID.setControlValueLimits(preHeaterCVMin, preHeaterCVMax, 0);
    preHeaterPID.setProportionalGain(config.getSetting("pre_heater_p_gain"));
    preHeaterPID.setIntegralGain(config.getSetting("pre_heater_i_gain"));
    preHeaterPID.setDerivativeGain(config.getSetting("pre_heater_d_gain"));
    preHeaterPID.setDesiredValue(0);

    // Setup our main heater PID
    mainHeaterPID.setControlValueLimits(mainHeaterCVMin, mainHeaterCVMax, 0);
    mainHeaterPID.setProportionalGain(config.getSetting("main_heater_p_gain"));
    mainHeaterPID.setIntegralGain(config.getSetting("main_heater_i_gain"));
    mainHeaterPID.setDerivativeGain(config.getSetting("main_heater_d_gain"));
    mainHeaterPID.setDesiredValue(0);

    sensor_interface.begin();
    sensor_interface.on("new_sensor", function (newSensorName, newSensorValueType) {

        node330.logInfo("Found new sensor " + newSensorName);

        var physicalComponent = createPhysicalComponentForSubsensor(node330, newSensorName, newSensorValueType);

        var component;

        if (newSensorName === config.getSetting("headsTemp_sensor")) {
            component = headsTemp;
        }
        else if (newSensorName === config.getSetting("preHeaterTemp_sensor")) {
            component = preHeaterTemp;
        }
        else if (newSensorName === config.getSetting("heartsTemp_sensor")) {
            component = heartsTemp;
        }
        else if (newSensorName === config.getSetting("tailsTemp_sensor")) {
            component = tailsTemp;
        }
        else if (newSensorName === config.getSetting("intermediateTemp_sensor")) {
            component = intermediateTemp;
        }
        else if (newSensorName === config.getSetting("ambientPressure_sensor")) {
            component = ambientPressure;
        }
        else if (newSensorName === config.getSetting("ambientTemp_sensor")) {
            component = ambientTemp;
        }
        else if (sumpTempSensorMappings[newSensorName]) {
            component = sumpTempSensorMappings[newSensorName];
        }

        if(component)
        {
            node330.mapPhysicalComponentToVirtualComponent(physicalComponent, component);
            component.setCalibrationOffset(config.getSetting(newSensorName + "_calibration", 0)); // Check for a calibration setting for the sensor and set it
        }
    });

    // When we lose a sensor
    sensor_interface.on("timeout", function (sensorName) {
        node330.logWarning("Sensor " + sensorName + " went offline.");

        if(started)
        {
            started = false;
            startStopSwitch.setValue(false);
            node330.logError("Shutting down due to " + sensorName + " going offline.");
            node330.raiseStateEvent("STOP");
        }
    });

    // Define our state engine
    node330.defineState("IDLE", IDLE_STATE_LOOP, IDLE_STATE_ENTER);
    node330.defineState("WARMUP", WARMUP_STATE_LOOP, WARMUP_STATE_ENTER);
    node330.defineState("RUN_READY", RUN_READY_STATE_LOOP, RUN_READY_STATE_ENTER);
    node330.defineState("RUNNING", RUNNING_STATE_LOOP, RUNNING_STATE_ENTER);
    node330.defineState("SHUTDOWN", SHUTDOWN_STATE_LOOP);

    node330.defineStateEvent("START", ["IDLE", "SHUTDOWN"], "RUNNING");
    node330.defineStateEvent("STOP", ["WARMUP", "RUN_READY", "RUNNING"], "SHUTDOWN");
    node330.defineStateEvent("MOVE_ON", "SHUTDOWN", "IDLE"); // Move from shutdown to idle

    node330.setCurrentState("IDLE");

    node330.addViewer(node330.restViewer());
    node330.addViewer(node330.webViewer());

    if (config.getSetting("dweet_enabled")) {
        node330.addViewer(node330.dweetViewer({
            thing: config.getSetting("dweet_thing"),
            key: config.getSetting("dweet_key")
        }));
    }
};

function IDLE_STATE_ENTER(startTime, startStopSwitch, calculatedPreheaterSetPoint, headsSetPoint, operationState, preHeaterPID, mainHeaterPID) {
    calculatedPreheaterSetPoint.setValue(headsSetPoint.getValue());
    feedstockDepletionCount = 0;
    startTime.setValue("0");
    operationState.setValue("IDLE");
    startStopSwitch.setValue(false);
    preHeaterPID.reset();
    mainHeaterPID.reset();
}

function IDLE_STATE_LOOP() {
    // Turn off our heaters and pumps and keep it that way
    setMainHeaterCV(0);
    setPreHeaterCV(0);
    setPumpCV(0);
}

var sumpTempWarmupReachedTime = 0;
function WARMUP_STATE_ENTER(config, startTime, mainHeaterSetPointOffset, operationState, preHeaterPGain, preHeaterIGain, preHeaterDGain, mainHeaterPGain, mainHeaterIGain, mainHeaterDGain) {
    preHeaterPGain.setValue(config.getSetting("pre_heater_p_gain"));
    preHeaterIGain.setValue(config.getSetting("pre_heater_i_gain"));
    preHeaterDGain.setValue(config.getSetting("pre_heater_d_gain"));

    mainHeaterPGain.setValue(config.getSetting("warmup_main_heater_p_gain"));
    mainHeaterIGain.setValue(config.getSetting("warmup_main_heater_i_gain"));
    mainHeaterDGain.setValue(config.getSetting("warmup_main_heater_d_gain"));

    mainHeaterSetPointOffset.setValue(config.getSetting("warmup_main_heater_offset"));

    sumpTempWarmupReachedTime = 0;

    operationState.setValue("WARMUP");
}

function maintainWarmupTemps(config, ambientPressure, pumpFlowRate, preHeaterPID, mainHeaterPID, mainHeaterSetPointOffset, calculatedSumpTemp, preHeaterTemp) {
    // Run our pump
    setPumpFlowRate(pumpFlowRate.getValue());

    // Warm up our pre-heater
    preHeaterPID.setDesiredValue(config.getSetting("warmup_pre_heater_set_point"));

    setPreHeaterCV(Math.round(preHeaterPID.update(preHeaterTemp.getValue())));

    // Warm up our main-heater
    var boilingPoint = getCurrentBoilingPoint(ambientPressure.getValue());
    var mainHeaterSetPoint = (boilingPoint - mainHeaterSetPointOffset.getValue()) + 0.0;
    mainHeaterPID.setDesiredValue(mainHeaterSetPoint);

    setMainHeaterCV(Math.round(mainHeaterPID.update(calculatedSumpTemp.getValue())));

    return mainHeaterSetPoint;
}

function WARMUP_STATE_LOOP(node330, config, calculatedSumpTemp, ambientPressure, pumpFlowRate, preHeaterPID, mainHeaterPID, mainHeaterSetPointOffset) {

    var mainHeaterSetPoint = maintainWarmupTemps(config, ambientPressure, pumpFlowRate, preHeaterPID, mainHeaterPID, mainHeaterSetPointOffset);

    // Rules:
    // #1 Sump temp has gone past our set point at least X number of seconds ago
    // #2 Sump temp is currently less than or equal to our set point
    // #3 Difference between our top sump probe and bottom sump probe is greater than X
    //
    // After rules are met, then we can check for the enableRunSwitch, to move on to our run ready state.
    if (sumpTempWarmupReachedTime == 0 && calculatedSumpTemp.getValue() > mainHeaterSetPoint) {
        sumpTempWarmupReachedTime = Date.now();
    }

    // var sumpTempDelta = sumpTemp5.getValue() - sumpTemp1.getValue();

    if (sumpTempWarmupReachedTime != 0 && Date.now() - sumpTempWarmupReachedTime >= 60000 && calculatedSumpTemp.getValue() <= mainHeaterSetPoint)// &&
    // sumpTempDelta >= config.getSetting("warmup_sump_temp_delta_switch"))
    {
        node330.raiseStateEvent("MOVE_ON");
    }
}

function RUN_READY_STATE_ENTER(operationState) {
    operationState.setValue("READY");
}

function RUN_READY_STATE_LOOP(node330, enableRunSwitch, config, ambientPressure, pumpFlowRate, preHeaterPID, mainHeaterPID, mainHeaterSetPointOffset) {
    maintainWarmupTemps(config, ambientPressure, pumpFlowRate, preHeaterPID, mainHeaterPID, mainHeaterSetPointOffset);

    if (enableRunSwitch.isOn()) {
        node330.raiseStateEvent("MOVE_ON");
    }
}

function RUNNING_STATE_ENTER(config, startTime, operationState, preHeaterPGain, preHeaterIGain, preHeaterDGain, mainHeaterPGain, mainHeaterIGain, mainHeaterDGain, mainHeaterSetPointOffset) {
    var now = new Date();
    startTime.setValue(now.toISOString());

    preHeaterPGain.setValue(config.getSetting("pre_heater_p_gain"));
    preHeaterIGain.setValue(config.getSetting("pre_heater_i_gain"));
    preHeaterDGain.setValue(config.getSetting("pre_heater_d_gain"));

    mainHeaterPGain.setValue(config.getSetting("main_heater_p_gain"));
    mainHeaterIGain.setValue(config.getSetting("main_heater_i_gain"));
    mainHeaterDGain.setValue(config.getSetting("main_heater_d_gain"));

    mainHeaterSetPointOffset.setValue(config.getSetting("main_heater_setpoint_offset"));
    operationState.setValue("RUN PARAMS");
}

function RUNNING_STATE_LOOP(calculatedPreheaterSetPoint, headsSetPointScale, config, operationState, enableRunSwitch, tailsSetPointScale, calculatedSumpTemp, pumpFlowRate, preHeaterPID, preHeaterTemp, headsSetPoint, tailsSetPoint, headsTemp, tailsTemp, ambientPressure, mainHeaterSetPointOffset, mainHeaterPID) {
    if (enableRunSwitch.isOn()) {
        // Run our pump
        setPumpFlowRate(pumpFlowRate.getValue());

        var newPreHeaterSP = calculatedPreheaterSetPoint.getValue() + headsSetPointScale.getValue() * (headsSetPoint.getValue() - headsTemp.getValue());

        if(currentPreHeaterPower > 0.0 || newPreHeaterSP > calculatedPreheaterSetPoint.getValue())
        {
            // Set our desired temp on our preheater
            calculatedPreheaterSetPoint.setValue(newPreHeaterSP);
        }

        preHeaterPID.setDesiredValue(calculatedPreheaterSetPoint.getValue());

        setPreHeaterCV(Math.round(preHeaterPID.update(preHeaterTemp.getValue())));

        // Calculate our boiling point and main heater set point
        var boilingPoint = getCurrentBoilingPoint(ambientPressure.getValue());
        var calculatedMainHeaterSetPointOffset = mainHeaterSetPointOffset.getValue() + tailsSetPointScale.getValue() * (tailsTemp.getValue() - tailsSetPoint.getValue());

        // Set our desired temp on our main heater
        mainHeaterPID.setDesiredValue(boilingPoint - calculatedMainHeaterSetPointOffset);

        setMainHeaterCV(Math.round(mainHeaterPID.update(calculatedSumpTemp.getValue())));
    }
    else {
        operationState.setValue("WARMUP PARAMS");
        maintainWarmupTemps(config, ambientPressure, pumpFlowRate, preHeaterPID, mainHeaterPID, mainHeaterSetPointOffset, calculatedSumpTemp, preHeaterTemp);
    }
}

function SHUTDOWN_STATE_LOOP(startStopSwitch, node330, pumpFlowRate, calculatedSumpTemp, operationState) {
    started = false;
    startStopSwitch.setValue(false);

    // Turn off our heaters
    setMainHeaterCV(0);
    setPreHeaterCV(0);

    // But keep our pump running to keep coolant flowing
    setPumpFlowRate(pumpFlowRate.getValue());

    operationState.setValue("SHUTDOWN");

    // Once we get to below 190 deg F on our main sump temp, then we can move on
    if (calculatedSumpTemp.tempInF() <= 160.0) {
        node330.raiseStateEvent("MOVE_ON");
    }
}

module.exports.loop = function (node330, config, floatSwitch, startStopSwitch, headsTemp, preHeaterTemp, heartsTemp, tailsTemp, sumpTempPrimarySensor, calculatedSumpTemp, ambientTemp, ambientPressure, preHeaterPID, mainHeaterPID, headsSetPoint, pumpFlowRate, mainHeaterSetPointOffset, preHeaterPower, mainHeaterPower, mainHeaterPGain, mainHeaterIGain, mainHeaterDGain, preHeaterPGain, preHeaterIGain, preHeaterDGain, preHeaterIntegral, mainHeaterIntegral) {
    floatSwitch.setValue(digital.digitalRead(config.getSetting("float_switch_pin")));

    if (tuningMode) {
        // Read values from our page and set them and save them to disk
        //config.setSetting("main_heater_p_gain", mainHeaterPGain.getValue());
        mainHeaterPID.setProportionalGain(mainHeaterPGain.getValue());

        //config.setSetting("main_heater_i_gain", mainHeaterIGain.getValue());
        mainHeaterPID.setIntegralGain(mainHeaterIGain.getValue());

        //config.setSetting("main_heater_d_gain", mainHeaterDGain.getValue());
        mainHeaterPID.setDerivativeGain(mainHeaterDGain.getValue());

        //config.setSetting("pre_heater_p_gain", preHeaterPGain.getValue());
        preHeaterPID.setProportionalGain(preHeaterPGain.getValue());

        //config.setSetting("pre_heater_i_gain", preHeaterIGain.getValue());
        preHeaterPID.setIntegralGain(preHeaterIGain.getValue());

        //config.setSetting("pre_heater_d_gain", preHeaterDGain.getValue());
        preHeaterPID.setDerivativeGain(preHeaterDGain.getValue());

        if (startStopSwitch.isOn()) {
            node330.setVirtualComponentReadOnly(preHeaterIntegral, true);
            node330.setVirtualComponentReadOnly(mainHeaterIntegral, true);

            preHeaterIntegral.setValue(preHeaterPID.getIntegral());
            mainHeaterIntegral.setValue(mainHeaterPID.getIntegral());
        }
        else {
            node330.setVirtualComponentReadOnly(preHeaterIntegral, false);
            node330.setVirtualComponentReadOnly(mainHeaterIntegral, false);

            preHeaterPID.setIntegral(preHeaterIntegral.getValue());
            mainHeaterPID.setIntegral(mainHeaterIntegral.getValue());
        }
    }

    var sumpTempSensorComponent = node330.getVirtualComponentNamed(sumpTempPrimarySensor.getValue());

    // Determine if we should use the sensor name for the calculated sump temp or if we should use the maximum of all the sump temps
    if(sumpTempSensorComponent)
    {
        calculatedSumpTemp.setValue(sumpTempSensorComponent.getValue());
    }
    else
    {
        // Get our max sump temp value
        var maxSumpTemp = _.max(_.values(sumpTempSensorMappings), function (mapping) {
            return mapping.getValue();
        });

        if (maxSumpTemp) {
            maxSumpTemp = maxSumpTemp.getValue();
        }
        else {
            maxSumpTemp = 0.0;
        }

        // Calculate our sump temp
        calculatedSumpTemp.setValue(maxSumpTemp);
    }

    // Report to the UI, what the heater powers are
    preHeaterPower.setValue(getPreHeaterPower());
    mainHeaterPower.setValue(getMainHeaterPower());

    // If the float switch gets activated, it means we're out of wash, and we should shut down.
    if (started && floatSwitch.isOff()) {
        feedstockDepletionCount++;

        // Give ourselves 10 counts (10 seconds) before we consider the feedstock really depleted.
        if (feedstockDepletionCount >= 10) {
            node330.logWarning("Shutting down due to feedstock depletion.");
            node330.raiseStateEvent("STOP");
        }
    }
    // If the tails, hearts, heads or pre-heater temp is over 200F, then we know something is wrong and we should just shut down
    else if (started && (calculatedSumpTemp.tempInF() >= 220 || tailsTemp.tempInF() >= 220 || heartsTemp.tempInF() >= 215 || headsTemp.tempInF() >= 212 || preHeaterTemp.tempInF() >= 210)) {
        node330.logError("Shutting down due to abnormally high column temperature readings.");
        node330.logError("Sump Temp: " + calculatedSumpTemp.tempInF());
        node330.logError("Tails Temp: " + tailsTemp.tempInF());
        node330.logError("Hearts Temp: " + heartsTemp.tempInF());
        node330.logError("Heads Temp: " + headsTemp.tempInF());
        node330.logError("Pre Heater Temp: " + preHeaterTemp.tempInF());
        node330.raiseStateEvent("STOP");
    }
    else if (!started && startStopSwitch.isOn()) {
        started = true;
        node330.raiseStateEvent("START");
    }
    else if (started && startStopSwitch.isOff()) {
        node330.raiseStateEvent("STOP");
    }

    if (floatSwitch.isOn()) {
        feedstockDepletionCount = 0;
    }
}

function mapRange(range1Min, range1Max, range2Min, range2Max, value) {
    return ((value - range1Min) / (range1Max - range1Min)) * (range2Max - range2Min) + range2Min;
}

function getCurrentBoilingPoint(pressureInBar) {
    // Calculate our boiling point
    var baroInHG = pressureInBar * 0.02953;
    var boilingPoint = Math.log(baroInHG) * 49.160999 + 44.93;

    return parseFloat(boilingPoint.toFixed(2));
}

function setMainHeaterCV(cv) {
    sensor_interface.setDAC(mainHeaterChannel, cv);
    currentMainHeaterPower = Math.max(0.0, parseFloat(mapRange(mainHeaterCVMin, mainHeaterCVMax, 0.0, 100.0, cv + 0.0).toFixed(2)));
}

function getMainHeaterPower() {
    return currentMainHeaterPower;
}

function setMainHeaterPower(power) {
    var cv = Math.round(mapRange(0, 100, mainHeaterCVMin, mainHeaterCVMax, power));
    setMainHeaterCV(cv);
}

function setPreHeaterCV(cv) {
    sensor_interface.setDAC(preHeaterChannel, cv);
    currentPreHeaterPower = Math.max(0.0, parseFloat(mapRange(preHeaterCVMin, preHeaterCVMax, 0.0, 100.0, cv + 0.0).toFixed(2)));
}

function getPreHeaterPower() {
    return currentPreHeaterPower;
}

function setPreHeaterPower(power) {
    var cv = Math.round(mapRange(0, 100, preHeaterCVMin, preHeaterCVMax, power));
    setPreHeaterCV(cv);
}

function setPumpCV(cv) {
    sensor_interface.setDAC(pumpChannel, cv);
}

function setPumpFlowRate(gallonsPerHour) {
    var cv = Math.round(773.75 * gallonsPerHour + 1000);
    setPumpCV(cv);
}
