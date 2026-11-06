# Motion editing

Custom vector scenes support object and group keyframes plus a camera track. The same frame-derived sampler drives Remotion preview, seeking and MP4 export. It uses no additional animation runtime.

In **Visual**, seek with **Animation position**. Open **Camera pan and zoom**, **Object groups**, or an object's **Object keyframes**, then add a keyframe at that position. Edit offsets, scale, rotation, opacity and easing. Save edits before exporting. Undo/redo restores saved motion tracks together with the artwork.

Object offsets are relative to the saved object position. Group transforms apply around their editable pivot in canvas coordinates. Camera offsets pan the view; headings and captions stay fixed. Scale and opacity use percentages. Keyframe times use milliseconds internally and appear as seconds in the editor. Each track supports up to twelve ordered poses, and all poses must fit the scene duration.

Gemini can now design these tracks for new scenes, including groups, easing and subtle camera movement. Existing scenes retain their previous animation unless edited or explicitly redesigned. Changing motion by hand, previewing and rendering do not call Gemini.

Theatre.js, Effekseer and the desktop animation applications were evaluated but not installed. This implementation extends the existing Remotion scene graph, preserving the current editor, saved scenes and rendering workflow.

Automated checks: `npm.cmd run verify` covers sampling, easing, references and timing validation. `npm.cmd run verify:full` also renders camera, group and object tracks with local fixture artwork, audio and captions. No live AI calls are included.
