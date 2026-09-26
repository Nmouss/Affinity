"use client";

import { EDITOR_TABS, type DraftPerson, type EditorTab, type MakerAction } from "./flow";
import { AccessoryTab, BodyTab, BrowsTab, CheeksTab, ColorsTab, EyesTab, MouthTab, NameTab } from "./EditorTabs";
import { playBlip } from "./sound";
import styles from "./EditorPanel.module.css";

const TAB_LABELS: Record<EditorTab, string> = {
  body: "Body",
  colors: "Colors",
  eyes: "Eyes",
  brows: "Brows",
  mouth: "Mouth",
  cheeks: "Cheeks",
  accessory: "Accessory",
  name: "Name",
};

export interface EditorPanelProps {
  draft: DraftPerson;
  tab: EditorTab;
  nameError: boolean;
  dispatch: (action: MakerAction) => void;
}

export function EditorPanel({ draft, tab, nameError, dispatch }: EditorPanelProps) {
  return (
    <div className={styles.editor}>
      <div className={styles.tabBar} role="tablist" aria-label="Editor sections">
        {EDITOR_TABS.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            data-hand-target={`tab:${key}`}
            className={tab === key ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => {
              playBlip("select");
              dispatch({ type: "setTab", tab: key });
            }}
          >
            {TAB_LABELS[key]}
            {key === "name" && !draft.name.trim() && <span className={styles.dot} aria-hidden />}
          </button>
        ))}
      </div>

      <div className={styles.content}>
        {tab === "body" && <BodyTab look={draft.look} dispatch={dispatch} />}
        {tab === "colors" && <ColorsTab look={draft.look} dispatch={dispatch} />}
        {tab === "eyes" && <EyesTab look={draft.look} dispatch={dispatch} />}
        {tab === "brows" && <BrowsTab look={draft.look} dispatch={dispatch} />}
        {tab === "mouth" && <MouthTab look={draft.look} dispatch={dispatch} />}
        {tab === "cheeks" && <CheeksTab look={draft.look} dispatch={dispatch} />}
        {tab === "accessory" && <AccessoryTab look={draft.look} dispatch={dispatch} />}
        {tab === "name" && <NameTab name={draft.name} nameError={nameError} dispatch={dispatch} />}
      </div>

      <div className={styles.footer}>
        <button
          type="button"
          data-hand-target="editor-quit"
          className={styles.quitButton}
          onClick={() => dispatch({ type: "quit" })}
        >
          Quit
        </button>
        <button
          type="button"
          data-hand-target="editor-save"
          className={styles.saveButton}
          onClick={() => {
            playBlip("save");
            dispatch({ type: "save" });
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
