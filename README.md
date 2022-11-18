# Node-RED file read/write nodes for pseudo file storage in the cloud

### Introduction
This package contains file read and write nodes that cannot be used at the same 
time as the built-in Node-RED file nodes. To use these nodes, you must exclude
`10-file-js` in the `nodesExcludes` array in your settings file.

### Nodes

#### `file`
A file node for writing to persistent storage provided by a `@FlowForge/file-storage` server


#### `file in`
A file node for reading from persistent storage provided by a `@FlowForge/file-storage` server


### Notes
* The nodes have built in help to assist with runtime use
* These file nodes provide the same features as the built-in file nodes except they operate
against a file server API not an regular filesystem
