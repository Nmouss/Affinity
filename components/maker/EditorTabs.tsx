"use client";

import { PART_OPTIONS, EYE_COLORS, FAVORITE_COLORS, SKIN_TONES } from "@/types/character";
import type { CharacterLook } from "@/types/character";
import { PartIcon } from "./partIcons";
import { OptionGrid } from "./OptionGrid";
import { ColorRow } from "./ColorRow";
import { Stepper } from "./Stepper";
import { MAX_NAME_LENGTH, type MakerAction } from "./flow";
import styles from "./EditorTabs.module.css";

// The eight tab panels behind the People Maker editor's tab bar. Each is a thin view over the
// draft look plus a dispatch function; all state changes go back through flow.ts.

export interface TabProps {
  look: CharacterLook;
  dispatch: (action: MakerAction) => void;
}

const BODY_STEP = 0.05;

export function BodyTab({ look, dispatch }: TabProps) {
  return (
    <div className={styles.panel}>
      <Stepper
        label="Height"
        decreaseLabel="−"
        increaseLabel="+"
        handTargetPrefix="body:height"
        onDecrease={() => dispatch({ type: "setBody", field: "height", delta: -BODY_STEP })}
        onIncrease={() => dispatch({ type: "setBody", field: "height", delta: BODY_STEP })}
      />
      <Stepper
        label="Build"
        decreaseLabel="−"
        increaseLabel="+"
        handTargetPrefix="body:build"
        onDecrease={() => dispatch({ type: "setBody", field: "build", delta: -BODY_STEP })}
        onIncrease={() => dispatch({ type: "setBody", field: "build", delta: BODY_STEP })}
      />
      <p className={styles.hint}>
        Height {Math.round(look.body.height * 100)}% &middot; Build {Math.round(look.body.build * 100)}%
      </p>
    </div>
  );
}

export function ColorsTab({ look, dispatch }: TabProps) {
  return (
    <div className={styles.panel}>
      <h3 className={styles.subheading}>Body color</h3>
      <ColorRow
        colors={FAVORITE_COLORS}
        selected={look.bodyColor}
        handTargetPrefix="color:body"
        aria-label="Body color"
        onSelect={(color) => dispatch({ type: "setColor", field: "bodyColor", color })}
      />
      <h3 className={styles.subheading}>Accent color</h3>
      <ColorRow
        colors={FAVORITE_COLORS}
        selected={look.accent}
        handTargetPrefix="color:accent"
        aria-label="Accent color"
        onSelect={(color) => dispatch({ type: "setColor", field: "accent", color })}
      />
      <h3 className={styles.subheading}>Skin tone</h3>
      <ColorRow
        colors={SKIN_TONES}
        selected={look.skin}
        handTargetPrefix="color:skin"
        aria-label="Skin tone"
        onSelect={(color) => dispatch({ type: "setColor", field: "skin", color })}
      />
    </div>
  );
}

export function EyesTab({ look, dispatch }: TabProps) {
  return (
    <div className={styles.panel}>
      <OptionGrid
        options={PART_OPTIONS.eyes.map((type) => ({ value: type, label: type, icon: <PartIcon kind="eyes" option={type} /> }))}
        selected={look.eyes.type}
        handTargetPrefix="eyes-type"
        aria-label="Eye shape"
        onSelect={(option) => dispatch({ type: "setPart", part: "eyes", option })}
      />
      <h3 className={styles.subheading}>Eye color</h3>
      <ColorRow
        colors={EYE_COLORS}
        selected={look.eyes.color}
        handTargetPrefix="eyes-color"
        aria-label="Eye color"
        onSelect={(color) => dispatch({ type: "setPartColor", part: "eyes", color })}
      />
      <h3 className={styles.subheading}>Adjust</h3>
      <div className={styles.adjustRow}>
        <Stepper
          label="Height"
          decreaseLabel="↓"
          increaseLabel="↑"
          handTargetPrefix="eyes-adjust-height"
          onDecrease={() => dispatch({ type: "adjustEyes", field: "height", delta: -0.25 })}
          onIncrease={() => dispatch({ type: "adjustEyes", field: "height", delta: 0.25 })}
        />
        <Stepper
          label="Size"
          decreaseLabel="−"
          increaseLabel="+"
          handTargetPrefix="eyes-adjust-size"
          onDecrease={() => dispatch({ type: "adjustEyes", field: "size", delta: -0.25 })}
          onIncrease={() => dispatch({ type: "adjustEyes", field: "size", delta: 0.25 })}
        />
        <Stepper
          label="Spacing"
          decreaseLabel="←"
          increaseLabel="→"
          handTargetPrefix="eyes-adjust-spacing"
          onDecrease={() => dispatch({ type: "adjustEyes", field: "spacing", delta: -0.25 })}
          onIncrease={() => dispatch({ type: "adjustEyes", field: "spacing", delta: 0.25 })}
        />
      </div>
    </div>
  );
}

export function BrowsTab({ look, dispatch }: TabProps) {
  return (
    <div className={styles.panel}>
      <OptionGrid
        options={PART_OPTIONS.brows.map((type) => ({ value: type, label: type, icon: <PartIcon kind="brows" option={type} /> }))}
        selected={look.brows.type}
        handTargetPrefix="brows-type"
        aria-label="Brow shape"
        onSelect={(option) => dispatch({ type: "setPart", part: "brows", option })}
      />
      <h3 className={styles.subheading}>Adjust</h3>
      <Stepper
        label="Height"
        decreaseLabel="↓"
        increaseLabel="↑"
        handTargetPrefix="brows-adjust-height"
        onDecrease={() => dispatch({ type: "adjustBrows", delta: -0.25 })}
        onIncrease={() => dispatch({ type: "adjustBrows", delta: 0.25 })}
      />
    </div>
  );
}

export function MouthTab({ look, dispatch }: TabProps) {
  return (
    <div className={styles.panel}>
      <OptionGrid
        options={PART_OPTIONS.mouth.map((type) => ({ value: type, label: type, icon: <PartIcon kind="mouth" option={type} /> }))}
        selected={look.mouth.type}
        handTargetPrefix="mouth-type"
        aria-label="Mouth shape"
        onSelect={(option) => dispatch({ type: "setPart", part: "mouth", option })}
      />
    </div>
  );
}

export function CheeksTab({ look, dispatch }: TabProps) {
  return (
    <div className={styles.panel}>
      <button
        type="button"
        data-hand-target="cheeks-toggle"
        className={look.cheeks.on ? `${styles.toggle} ${styles.toggleOn}` : styles.toggle}
        aria-pressed={look.cheeks.on}
        onClick={() => dispatch({ type: "setCheeksOn", on: !look.cheeks.on })}
      >
        Rosy cheeks: {look.cheeks.on ? "On" : "Off"}
      </button>
      {look.cheeks.on && (
        <>
          <h3 className={styles.subheading}>Cheek color</h3>
          <ColorRow
            colors={FAVORITE_COLORS}
            selected={look.cheeks.color}
            handTargetPrefix="cheeks-color"
            aria-label="Cheek color"
            onSelect={(color) => dispatch({ type: "setCheeksColor", color })}
          />
        </>
      )}
    </div>
  );
}

export function AccessoryTab({ look, dispatch }: TabProps) {
  return (
    <div className={styles.panel}>
      <OptionGrid
        options={PART_OPTIONS.accessory.map((type) => ({
          value: type,
          label: type,
          icon: <PartIcon kind="accessory" option={type} />,
        }))}
        selected={look.accessory.type}
        handTargetPrefix="accessory-type"
        aria-label="Accessory"
        onSelect={(option) => dispatch({ type: "setPart", part: "accessory", option })}
      />
      {look.accessory.type !== "none" && (
        <>
          <h3 className={styles.subheading}>Accessory color</h3>
          <ColorRow
            colors={FAVORITE_COLORS}
            selected={look.accessory.color}
            handTargetPrefix="accessory-color"
            aria-label="Accessory color"
            onSelect={(color) => dispatch({ type: "setPartColor", part: "accessory", color })}
          />
        </>
      )}
    </div>
  );
}

const KEYBOARD_ROWS = ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

export interface NameTabProps {
  name: string;
  nameError: boolean;
  dispatch: (action: MakerAction) => void;
}

export function NameTab({ name, nameError, dispatch }: NameTabProps) {
  return (
    <div className={styles.panel}>
      <label className={styles.nameFieldLabel} htmlFor="maker-name-input">
        Name
      </label>
      <input
        id="maker-name-input"
        className={nameError ? `${styles.nameField} ${styles.nameFieldError}` : styles.nameField}
        value={name}
        maxLength={MAX_NAME_LENGTH}
        placeholder="Type a name"
        autoComplete="off"
        onChange={(event) => dispatch({ type: "setName", name: event.target.value })}
      />
      {nameError && <p className={styles.nameError}>Every person needs a name.</p>}
      <div className={styles.keyboard} role="group" aria-label="On-screen keyboard">
        {KEYBOARD_ROWS.map((row, rowIndex) => (
          <div key={rowIndex} className={styles.keyboardRow}>
            {row.split("").map((letter) => (
              <button
                key={letter}
                type="button"
                data-hand-target={`key:${letter}`}
                className={styles.key}
                onClick={() => dispatch({ type: "typeChar", char: letter })}
              >
                {letter}
              </button>
            ))}
          </div>
        ))}
        <div className={styles.keyboardRow}>
          <button
            type="button"
            data-hand-target="key:space"
            className={`${styles.key} ${styles.keySpace}`}
            onClick={() => dispatch({ type: "typeChar", char: " " })}
          >
            Space
          </button>
          <button
            type="button"
            data-hand-target="key:backspace"
            className={`${styles.key} ${styles.keyWide}`}
            onClick={() => dispatch({ type: "backspace" })}
            aria-label="Backspace"
          >
            &#9003;
          </button>
        </div>
      </div>
    </div>
  );
}
