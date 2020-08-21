# Goggle Pray Muzak (GPM)

    Copyright (C) 2020 Ben Jefferson

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published
    by the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <https://www.gnu.org/licenses/>.
## Contents
* [Introduction](#introduction)
* [Installation](#installation)

## <a name="introduction"></a>Introduction
I started writing GPM for several reasons
1. To get back the features I know and love from Google Play Music which will disappear when this is discontinued and replaced by YouTube music.
2. Google Assistant is great, but gradually small aspects of it have become annoying - especially so as there is no way for me, as a developer to get in and improve it.
3. I tried using the the Google Home API to add functionality to the assistant and it was a right old palava.

So I looked around and found that there were open source projects to deliver most of the key components. I have simply added the glue to bring these all together. 

## Design Principles
My aim is to build GPM as a modular framework for home automation and voice assistant projects which will be:
1. Extensible: a pluggable architecture allowing new features to be added cleanly and easily in
2. Modular: allowing elements to be swapped in and out. For instance, right now GPM uses Google Cloud solutions for the speech-to-text and text-to-speech elements. I hope that in time new modules will be added that can do both these tasks locally rather than relying on a paid external system (e.g. Using Mozilla Deep Speech)

## Status
This code is very much a work in progress. It works for me, but your millage may vary. It is currently highly tailored to the hardware I am using (Raspberry Pi 4 & Jabra 710 Speakerphone). The code varies in quality as I gradually transform it from early proof-of-concept sketches to more stable and efficient code.

The code is written in a variety of languages: PHP, Javascript (Node.js) and Python. My intention is to replace any PHP with Javascript in the longer term.

Most of what should be configuration options are currently hard coded values - you will see that fixing this is high up on the todo list.

## <a name="installation"></a>Installation
**TODO** Finish this section

## Core Components
The system is built from the following basic building blocks

### manager.js
**TODO** Finish this section

### Triggers
Triggers are things which detect external (or internal) stimuli which trigger events. Examples of stimuli might be:
* a sensor picking up a change in the external environment (e.g. a rise in temperature)
* a user saying a wake word
* an incoming email
* some other form of message from another system (local or remote)

Triggers are defined as javascript files in the `triggers` directory. Each javascript file in this directory is imported (currently hard coded but will soon be automatic) and should define an object with the same name as the filename with the .js removed. As each trigger definition is imported an instance of the corresponding object is created. On creation the trigger object is passed the manager object as the only parameter.

Trigger objects don't currently actually need to define any specific methods! When the trigger object is created it is passed a single parameter which is the manager object. The trigger should set up asynchronous event listeners for whatever event it is listening out for and when these events fire the trigger code should call the `enqueue()` method of the manager object it was passed on creation. The `enqueue()` method takes an arbitrary number of parameters: the first is the name of the task to run, the rest of the parameters are passed to the specified task's `run` method. 

### triggers/WakeWord.js
WakeWords.js is a module that triggers when it hears a wake word. This uses an external process to actually do the listening. It spawns a copy of that process and simply waits for that process to generate a non-empty line on STDOUT whenever it hears the wake word. It does not currently matter what text the line contains, although this may be used in future to allow the user to trigger different tasks by using different wake words.

When it hears a wake word, the WakeWord object uses the manager object it was passed on creation to call the `enqueue()` method to add the
Assistant task to the task queue. At present the fact that this triggers the Assistant task is hard-coded into WakeWord, however if due course this might do things like use the WakeWord that was used to determine which of a range of tasks it should enqueue.

### triggers/porcupine.py
Porcupine.py is a program which listens for a wake word. As its name suggests this currently uses the [Porcupine wake word engine](https://github.com/Picovoice/porcupine). As per the interface defined above by WakeWord.js, this script fires up Porcupine and listens for the wake word. When it hears it it prints a line to STDOUT containing the wake word it heard.

The [free wake word models provided by Picovoice](https://github.com/Picovoice/porcupine/tree/master/resources/keyword_files/raspberry-pi) work on a limited number of words - I chose "americano" and "porcupine" as these seemed to work best for me. The words this script uses are currently hard-coded into the script (see todo item regarding adding configuration handling).

This script is currently hard-coded to use [PulseAudio](https://www.freedesktop.org/wiki/Software/PulseAudio/) as the audio source. This is important as this script needs to share the microphone audio source with the listener process described below. As far as I know, [Alsa](https://alsa-project.org/wiki/Main_Page) doesn't support two programs sharing the same source. We could stop this script from using the audio whilst the listener was listening, and then switch back over when the listener is not listening, but this felt to me like it was likely to a complex to manage and likely to be unreliable.

### triggers/Fifo.js
Coming soon: This trigger will open a FIFO and wait for lines to appear in this. Each line will consist of a task name followed by a colon then arbitrary text. The text will be passed to the specified task as the first parameter to the `run()` method. This should make integrating arbitrary external triggers pretty easy. It will also provide a very simple way to test tasks at the command line when there is no microphone plugged, or you are not in the same room as the microphone.

### Tasks
Task make something happen. Tasks might things like:
* Listening to a command from the user and acting on it
* Interacting with some kind of external device or service that makes something happen
* Sending an email
* Playing a sound/some music

Tasks are defined as javascript files in the `tasks` directory. Each javascript file in this directory is imported (currently hard coded but will soon be automatic) and should define an object with the same name as the filename with the .js removed. As each task definition is imported an instance of the corresponding object is created. On creation the task object is passed the manager object as the only parameter.

Each task object must define a `run()` method. This is the method which is called when something has triggered this task. The `run()` method is passed whatever parameters were generated by the trigger.

The manager processes tasks in serial, so it is essential that the task eventually call's the manager's `done()` method to let the manager know that it has finished and the manager can go back to processing the next task in the queue, or waiting for the next trigger.

### tasks/Assistant.js
This is the task that implements the voice assistant functionality.
**TODO** Finish this section

### tasks/listener.js
**TODO** Finish this section

### tasks/Pattern.js
This is a simple natural language regular expression engine used by Assistant.js to interpret what the user has said and convert this into actions.
**TODO** Finish this section

### speaker.js
**TODO** Finish this section

### MPD (&mpc)
[MPD](https://www.musicpd.org/) is used to actually play music.
**TODO** Finish this section

## TODO
* Finish documentation
* MPD integration - so it can actually play music!
* Automatically import all triggers and tasks in the triggers and tasks directories
* Add some sort of configuration handling
* Support for casting to Google Chromecast - including sending different audio to different devices at the same time. This will probably be based around [mkchromecast](https://mkchromecast.com/) (multiple instances thereof) and running multiple instances of MPD
