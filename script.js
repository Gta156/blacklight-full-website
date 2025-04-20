// --- START OF FILE script.js ---

// ========================================================================== //
//                              NBT Helper Section                            //
// ========================================================================== //

// NBT Tag Type Constants (Used by Commands to Structure & Schem to Commands)
const TAG_END = 0;
const TAG_BYTE = 1;
const TAG_SHORT = 2;
const TAG_INT = 3;
const TAG_LONG = 4;
const TAG_FLOAT = 5;
const TAG_DOUBLE = 6;
const TAG_BYTE_ARRAY = 7;
const TAG_STRING = 8;
const TAG_LIST = 9;
const TAG_COMPOUND = 10;
const TAG_INT_ARRAY = 11;
const TAG_LONG_ARRAY = 12;

// --- NBT Writing Helpers (from commands_to_struture.js) ---
// Note: These rely on a global 'currentOffset' managed during buffer creation.
let nbtWriterCurrentOffset = 0; // Specific offset for the writer

function writeByte(buffer, offset, value) {
    buffer.setInt8(offset, value);
    return offset + 1;
}

function writeUnsignedShort(buffer, offset, value) {
    buffer.setUint16(offset, value, true); // true for little-endian
    return offset + 2;
}

function writeInt(buffer, offset, value) {
    buffer.setInt32(offset, value, true); // true for little-endian
    return offset + 4;
}

function writeStringPayload(buffer, offset, text) {
    if (text === null || text === undefined) text = "";
    const encoder = new TextEncoder();
    const utf8Bytes = encoder.encode(text);
    offset = writeUnsignedShort(buffer, offset, utf8Bytes.length);
    for (let i = 0; i < utf8Bytes.length; i++) {
        buffer.setUint8(offset + i, utf8Bytes[i]);
    }
    return offset + utf8Bytes.length;
}

function getNbtType(value) {
    if (typeof value === "boolean") return TAG_BYTE;
    if (typeof value === "number") {
        if (Number.isInteger(value)) return TAG_INT;
        return TAG_FLOAT; // Using Float for non-integers
    }
    if (typeof value === "string") return TAG_STRING;
    if (Array.isArray(value)) return TAG_LIST;
    if (typeof value === "object" && value !== null) return TAG_COMPOUND;
    throw new TypeError(`Unsupported JavaScript type for NBT conversion: ${typeof value}`);
}

function writeTagNonRecursive(buffer, name, value) {
    try {
        // Write tag type
        nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, getNbtType(value));

        // Write name if provided
        if (name !== null && name !== undefined) {
            nbtWriterCurrentOffset = writeStringPayload(buffer, nbtWriterCurrentOffset, name);
        }

        // Write payload based on type
        if (typeof value === "boolean") {
            nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, value ? 1 : 0);
        } else if (Number.isInteger(value)) {
            nbtWriterCurrentOffset = writeInt(buffer, nbtWriterCurrentOffset, value);
        } else if (typeof value === "number") {
            const floatArray = new Float32Array(1);
            floatArray[0] = value;
            const intValue = new Int32Array(floatArray.buffer)[0];
            nbtWriterCurrentOffset = writeInt(buffer, nbtWriterCurrentOffset, intValue);
        } else if (typeof value === "string") {
            nbtWriterCurrentOffset = writeStringPayload(buffer, nbtWriterCurrentOffset, value);
        } else if (Array.isArray(value)) {
            writeListNonRecursive(buffer, value);
        } else if (typeof value === "object" && value !== null) {
            const keys = Object.keys(value);
            for (const key of keys) {
                writeTagNonRecursive(buffer, key, value[key]);
            }
            nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, TAG_END);
        }
    } catch (e) {
        console.error(`Error writing tag ${name}:`, e);
        throw e;
    }
}

function writeListNonRecursive(buffer, dataList) {
    try {
        if (!dataList.length) {
            nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, TAG_END);
            nbtWriterCurrentOffset = writeInt(buffer, nbtWriterCurrentOffset, 0);
            return;
        }

        const firstItem = dataList[0];
        let elementType = getNbtType(firstItem);

        nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, elementType);
        nbtWriterCurrentOffset = writeInt(buffer, nbtWriterCurrentOffset, dataList.length);

        for (let i = 0; i < dataList.length; i++) {
            const item = dataList[i];

            if (typeof item === "boolean") {
                nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, item ? 1 : 0);
            } else if (Number.isInteger(item)) {
                nbtWriterCurrentOffset = writeInt(buffer, nbtWriterCurrentOffset, item);
            } else if (typeof item === "number") {
                const floatArray = new Float32Array(1);
                floatArray[0] = item;
                const intValue = new Int32Array(floatArray.buffer)[0];
                nbtWriterCurrentOffset = writeInt(buffer, nbtWriterCurrentOffset, intValue);
            } else if (typeof item === "string") {
                nbtWriterCurrentOffset = writeStringPayload(buffer, nbtWriterCurrentOffset, item);
            } else if (Array.isArray(item)) {
                writeListNonRecursive(buffer, item);
            } else if (typeof item === "object" && item !== null) {
                const objKeys = Object.keys(item);
                for (const key of objKeys) {
                    writeTagNonRecursive(buffer, key, item[key]);
                }
                nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, TAG_END);
            } else {
                console.warn(`Unsupported item type in list at index ${i}:`, item);
            }
        }
    } catch (e) {
        console.error("Error writing list:", e);
        throw e;
    }
}

function estimateNbtBufferSize(data) {
    const jsonSize = JSON.stringify(data).length;
    return Math.max(jsonSize * 4, 10 * 1024 * 1024); // At least 10MB or 4x JSON size
}

function createNbtBuffer(data) {
    try {
        const estimatedSize = estimateNbtBufferSize(data);
        const arrayBuffer = new ArrayBuffer(estimatedSize);
        const buffer = new DataView(arrayBuffer);
        nbtWriterCurrentOffset = 0; // Reset writer offset

        nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, TAG_COMPOUND);
        nbtWriterCurrentOffset = writeStringPayload(buffer, nbtWriterCurrentOffset, ""); // Empty name for root

        const rootKeys = Object.keys(data);
        for (const key of rootKeys) {
            writeTagNonRecursive(buffer, key, data[key]);
        }

        nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, TAG_END); // Final TAG_End for root

        return arrayBuffer.slice(0, nbtWriterCurrentOffset); // Return used portion
    } catch (e) {
        console.error("Error during NBT buffer creation:", e);
        throw e;
    }
}
// --- End NBT Writing Helpers ---

// --- NBT Reading Helpers (from schem_to_commands_script.js) ---
class BinaryReader {
    constructor(buffer) {
        this.view = new DataView(buffer);
        this.position = 0;
    }

    ensureReadableBytes(count) {
        if (this.position + count > this.view.byteLength) {
            throw new Error(`Not enough bytes remaining. Needed ${count}, have ${this.view.byteLength - this.position} at position ${this.position}`);
        }
    }

    readByte() {
        this.ensureReadableBytes(1);
        const value = this.view.getInt8(this.position);
        this.position += 1;
        return value;
    }

    readShort() {
        this.ensureReadableBytes(2);
        const value = this.view.getInt16(this.position, false); // big-endian
        this.position += 2;
        return value;
    }

    readInt() {
        this.ensureReadableBytes(4);
        const value = this.view.getInt32(this.position, false);
        this.position += 4;
        return value;
    }

    readLong() {
        this.ensureReadableBytes(8);
        const high = this.view.getInt32(this.position, false);
        const low = this.view.getInt32(this.position + 4, false);
        this.position += 8;
        return (BigInt(high) << 32n) | (BigInt(low) & 0xFFFFFFFFn);
    }

    readFloat() {
        this.ensureReadableBytes(4);
        const value = this.view.getFloat32(this.position, false);
        this.position += 4;
        return value;
    }

    readDouble() {
        this.ensureReadableBytes(8);
        const value = this.view.getFloat64(this.position, false);
        this.position += 8;
        return value;
    }

    readBytes(length) {
        this.ensureReadableBytes(length);
        const bytes = new Uint8Array(this.view.buffer, this.view.byteOffset + this.position, length);
        this.position += length;
        return bytes;
    }

    readString() {
        const length = this.readShort();
        if (length < 0) throw new Error(`Invalid string length: ${length}`);
        if (length === 0) return "";
        return new TextDecoder("utf-8").decode(this.readBytes(length));
    }
}

function readNbtTagPayload(reader, type) {
    switch (type) {
        case TAG_END: return null;
        case TAG_BYTE: return reader.readByte();
        case TAG_SHORT: return reader.readShort();
        case TAG_INT: return reader.readInt();
        case TAG_LONG: return reader.readLong();
        case TAG_FLOAT: return reader.readFloat();
        case TAG_DOUBLE: return reader.readDouble();
        case TAG_BYTE_ARRAY: {
            const length = reader.readInt();
            if (length < 0) throw new Error(`Invalid TAG_BYTE_ARRAY length: ${length}`);
            return reader.readBytes(length);
        }
        case TAG_STRING: return reader.readString();
        case TAG_LIST: {
            const listType = reader.readByte();
            const length = reader.readInt();
            if (length < 0) throw new Error(`Invalid TAG_LIST length: ${length}`);
            const list = [];
            for (let i = 0; i < length; i++) {
                list.push(readNbtTagPayload(reader, listType));
            }
            return { listType: listType, value: list };
        }
        case TAG_COMPOUND: {
            const compound = {};
            while (true) {
                const tag = readNamedNbtTag(reader);
                if (tag === null || tag.type === TAG_END) break;
                compound[tag.name] = tag.payload;
            }
            return compound;
        }
        case TAG_INT_ARRAY: {
            const length = reader.readInt();
            if (length < 0) throw new Error(`Invalid TAG_INT_ARRAY length: ${length}`);
            const array = [];
            for (let i = 0; i < length; i++) {
                array.push(reader.readInt());
            }
            return array;
        }
        case TAG_LONG_ARRAY: {
            const length = reader.readInt();
            if (length < 0) throw new Error(`Invalid TAG_LONG_ARRAY length: ${length}`);
            const array = [];
            for (let i = 0; i < length; i++) {
                array.push(reader.readLong());
            }
            return array;
        }
        default:
            throw new Error(`Unsupported NBT tag type: ${type} at position ${reader.position - 1}`);
    }
}

function readNamedNbtTag(reader) {
    const type = reader.readByte();
    if (type === TAG_END) {
        return { type: TAG_END, name: "", payload: null };
    }
    const name = reader.readString();
    const payload = readNbtTagPayload(reader, type);
    return { type, name, payload };
}

function loadSchematicNBT(buffer) {
    const reader = new BinaryReader(buffer);
    const rootTag = readNamedNbtTag(reader);
    if (!rootTag || rootTag.type !== TAG_COMPOUND) {
        throw new Error(`Root tag must be TAG_COMPOUND, found type ${rootTag ? rootTag.type : 'null'}`);
    }
    return rootTag.payload;
}
// --- End NBT Reading Helpers ---

// ========================================================================== //
//                     Raw to NBT Converter Logic                             //
//========================================================================== //

// --- Start of Replacement Block (Exact structure from raw_to_nbt.js) ---
// Global state for Raw to NBT tool (Re-declared here for clarity, but uses the same top-level variable)
let rawToNbtFileContent = ''; // Using the shared global variable

// Helper function to get UTF-8 byte length
function getUtf8ByteLength(str) {
    const encoder = new TextEncoder();
    return encoder.encode(str).length;
}

// Escapes double quotes in commands
function escapeQuotes(command) {
    return command.replace(/"/g, '\\\\\\"');
}

// Processes file content into an array of commands
function getUsefulCommands(content) {
    const commands = content.split('\n').map(cmd => cmd.trim()).filter(cmd => cmd.length > 0);
    return commands.map(escapeQuotes);
}

// Separates commands into normal and equals types
function separateCommands(commands) {
    const normalCommands = [];
    const equalsCommands = [];
    commands.forEach(cmd => {
        if (cmd.includes('=')) {
            equalsCommands.push(cmd);
        } else {
            normalCommands.push(cmd);
        }
    });
    return { normalCommands, equalsCommands };
}

// NBT block opener
function getBlockOpener(nbtName) {
    // Using Blacklight branding as established previously
    return `{Block:{name:"minecraft:moving_block",states:{},version:17959425},Count:1b,Damage:0s,Name:"minecraft:moving_block",WasPickedUp:0b,tag:{display:{Lore:["Â§lÂ§bBuild By: Â§dBlacklightî„€","Â§3NBT Tool By: Â§aBrutus314 ","Â§aand Clawsky123î„ ","Â§9Conversion Tool By: ","Â§eExgioan!!î„‚","Â§fSpecial Thanks To:","Â§6Chronicles765!!    î„ƒ","Â§4Warning: Â§cDont Hold Too","Â§cMany Or You Will Lag!!Â§âˆ†"],Name:"Â§lÂ§dBlacklight NBT: Â§gÂ§l${nbtName}"},ench:[{id:28s,lvl:1s}],movingBlock:{name:"minecraft:sea_lantern",states:{},version:17879555},movingEntity:{Occupants:[`;
}

// NBT block closer
function getBlockCloser() {
    return '],id:"Beehive"}}}';
}

// Normal NPC opener
function getNpcOpener(section, nbtName) {
    return `{ActorIdentifier:"minecraft:npc<>",SaveData:{Actions:"[{"button_name" : "Build Part: ${section}","data" : [`;
}

// Normal NPC closer
function getNpcCloser(section, nbtName) {
     // Using Blacklight branding as established previously
    return `],"mode" : 0,"text" : "","type" : 1}]",CustomName:"Â§lÂ§dBlacklight NBT: ${nbtName}",CustomNameVisible:1b,InterativeText:"Â§cBuild By: Â§dBlacklight!!î„€\nBuild Part: ${section}\nÂ§cConversion Tool By: Â§dExgioan!!\nÂ§cSpecial Thanks To: Â§dChronicles765!!! î„ƒ\nÂ§6Thanks For Trying My ${nbtName} Build!!!",Persistent:1b,Pos:[],RawtextName:"Â§lÂ§dBlacklight NBT: ${nbtName}",Tags:["${nbtName}${section}"],Variant:3,definitions:["+minecraft:npc"],identifier:"minecraft:npc"},TicksLeftToStay:0}`;
}

// Equals NPC opener
function getEqualsNpcOpener(section, nbtName) {
    return `{ActorIdentifier:"minecraft:npc<>",SaveData:{"Actions":"[{\\"button_name\\" : \\"Build Part: ${section}\\",       \\"data\\" : [`;
}

// Equals NPC closer
function getEqualsNpcCloser(section, nbtName) {
    // Using Blacklight branding as established previously
    return `],       \\"mode\\" : 0,       \\"text\\" : \\"\\",       \\"type\\" : 1}]",CustomName:"Â§lÂ§dBlacklight NBT: ${nbtName}",CustomNameVisible:1b,InteractiveText:"§cBuild By:"Â§cBuild By: Â§dBlacklight!!î„€\nBuild Part: ${section}\nÂ§cConversion Tool By: Â§dExgioan!!\nÂ§cSpecial Thanks To: Â§dChronicles765!!!\n§6Thanks For Trying My ${nbtName} Build!!!",Persistent:1b,Pos:[],RawtextName:"Â§lÂ§dBlacklight NBT: ${nbtName}",Tags:["${nbtName}${section}"],Variant:3,definitions:["+minecraft:npc"],identifier:"minecraft:npc"},TicksLeftToStay:0}`;
}

// Joins normal commands
function commandJoinerNormal(commands) {
    return commands.map(cmd => `{"cmd_line":"${cmd}","cmd_ver":12}`).join(',');
}

// Joins equals commands with specific formatting
function commandJoinerEquals(commands) {
    return commands.map(cmd => `          {             \\"cmd_line\\":\\"${cmd}\\",             \\"cmd_ver\\" : 42          }`).join(',');
}

// Processes commands into NPC blocks with byte limit
function processNpcCommandsByBytes(commands, maxBytes, nbtName, startSection, joiner, isEquals) {
    const npcDataList = [];
    let currentCommands = [];
    let currentSection = startSection;
    const openerFunc = isEquals ? getEqualsNpcOpener : getNpcOpener;
    const closerFunc = isEquals ? getEqualsNpcCloser : getNpcCloser;

    for (const cmd of commands) {
        const candidateCommands = [...currentCommands, cmd];
        const candidateJoined = joiner(candidateCommands);
        const openerText = openerFunc(currentSection, nbtName);
        const closerText = closerFunc(currentSection, nbtName);
        const candidateBlock = openerText + candidateJoined + closerText;
        const candidateByteLength = getUtf8ByteLength(candidateBlock);

        if (candidateByteLength <= maxBytes) {
            currentCommands.push(cmd);
        } else {
             // Finalize current block if it has commands
            if (currentCommands.length > 0) {
                const npcCommandList = [...currentCommands];
                if (!isEquals) {
                    npcCommandList.push('/tickingarea add circle ~60 ~20 ~60 4 NPCCOMMANDS');
                } else {
                    npcCommandList.push('/tickingarea add circle ~60 ~20 ~60 4 EQUALSCOMMANDS');
                }
                // Dialogue open command added conditionally later
                npcCommandList.push('/kill @s');
                if (!isEquals) {
                    npcCommandList.push('/tickingarea remove NPCCOMMANDS');
                } else {
                    npcCommandList.push('/tickingarea remove EQUALSCOMMANDS');
                }
                const joinedCommands = joiner(npcCommandList);
                const npcBlock = openerFunc(currentSection, nbtName) + joinedCommands + closerFunc(currentSection, nbtName);
                npcDataList.push({ block: npcBlock, section: currentSection });
             }
            // Start new block
            currentSection += 1;
            currentCommands = [cmd];
        }
    }

    // Finalize last block
    if (currentCommands.length > 0) {
        const npcCommandList = [...currentCommands];
        if (!isEquals) {
            npcCommandList.push('/tickingarea add circle ~60 ~20 ~60 4 NPCCOMMANDS');
        } else {
            npcCommandList.push('/tickingarea add circle ~60 ~20 ~60 4 EQUALSCOMMANDS');
        }
        // No dialogue open for the last block
        npcCommandList.push('/kill @s');
        if (!isEquals) {
            npcCommandList.push('/tickingarea remove NPCCOMMANDS');
        } else {
            npcCommandList.push('/tickingarea remove EQUALSCOMMANDS');
        }
        const joinedCommands = joiner(npcCommandList);
        const npcBlock = openerFunc(currentSection, nbtName) + joinedCommands + closerFunc(currentSection, nbtName);
        npcDataList.push({ block: npcBlock, section: currentSection });
    }

     // Add dialogue open commands by modifying previous blocks (Post-processing step)
     for (let i = 0; i < npcDataList.length - 1; i++) {
        const currentBlockData = npcDataList[i];
        const nextSection = npcDataList[i + 1].section; // Get the actual next section number
        const dialogueOpenCmd = `/dialogue open @e[tag=${nbtName}${nextSection},type=NPC] @initiator`;
        // Must escape the command *before* formatting it
        const escapedDialogueCmd = escapeQuotes(dialogueOpenCmd);
        const dialogueOpenCmdFormatted = isEquals
            ? `          {             \\"cmd_line\\":\\"${escapedDialogueCmd}\\",             \\"cmd_ver\\" : 42          }`
            : `{"cmd_line":"${escapedDialogueCmd}","cmd_ver":12}`;

         // Try to insert before the kill command
         const killCmdJsonNormal = `{"cmd_line":"${escapeQuotes('/kill @s')}","cmd_ver":12}`;
         const killCmdJsonEquals = `          {             \\"cmd_line\\":\\"${escapeQuotes('/kill @s')}\\",             \\"cmd_ver\\" : 42          }`;
         const killCmdJson = isEquals ? killCmdJsonEquals : killCmdJsonNormal;

         const killIndex = currentBlockData.block.lastIndexOf(killCmdJson);

         if (killIndex !== -1) {
             // Find the comma before the kill command to insert correctly
             const commaIndex = currentBlockData.block.lastIndexOf(',', killIndex);
             if (commaIndex !== -1) {
                  npcDataList[i].block = currentBlockData.block.substring(0, commaIndex + 1) + dialogueOpenCmdFormatted + currentBlockData.block.substring(commaIndex);
             } else {
                  // Should not happen if kill command exists, but handle defensively
                  console.warn(`RawToNBT: Could not find comma before kill command in section ${currentBlockData.section}. Appending dialogue command.`);
                   const closerStr = closerFunc(currentBlockData.section, nbtName);
                   const insertionPoint = currentBlockData.block.lastIndexOf(closerStr);
                   if (insertionPoint !== -1) {
                        const commandsEnd = currentBlockData.block.lastIndexOf(']', insertionPoint);
                         if (commandsEnd !== -1) {
                            npcDataList[i].block = currentBlockData.block.substring(0, commandsEnd) + (currentCommands.length > 0 ? ',' : '') + dialogueOpenCmdFormatted + currentBlockData.block.substring(commandsEnd);
                         }
                   }
             }
         } else {
             console.warn(`RawToNBT: Could not find kill command for inserting dialogue command in section ${currentBlockData.section}. Appending.`);
             // Append before the closer if kill command wasn't found (less ideal)
              const closerStr = closerFunc(currentBlockData.section, nbtName);
              const insertionPoint = currentBlockData.block.lastIndexOf(closerStr);
              if (insertionPoint !== -1) {
                 const commandsEnd = currentBlockData.block.lastIndexOf(']', insertionPoint);
                  if (commandsEnd !== -1) {
                     npcDataList[i].block = currentBlockData.block.substring(0, commandsEnd) + (currentCommands.length > 0 ? ',' : '') + dialogueOpenCmdFormatted + currentBlockData.block.substring(commandsEnd);
                  }
              }
         }
    }

    return { npcData: npcDataList.map(item => item.block).join(','), count: npcDataList.length };
}

// --- End of Replacement Block ---
// ========================================================================== //
//                 Commands to Structure Converter Logic                      //
// ========================================================================== //

// Global state for Commands to Structure tool
let cmdStructFileContent = '';
let commandsToStructureData = { // Holds the generated structure data
    format_version: 1,
    size: [0, 0, 0],
    structure: {
        block_indices: [[], []],
        entities: [],
        palette: {
            default: {
                block_palette: [],
                block_position_data: {}
            }
        }
    },
    structure_world_origin: [0, 0, 0]
};
let cmdStructBlocksMap = {}; // Stores parsed blocks {x: {y: {z: [name, states]}}}


function parseCmdStructCoordinate(coordStr) {
    coordStr = coordStr.trim();
    if (coordStr.startsWith('~')) {
        const offset = coordStr.substring(1);
        return offset ? parseInt(offset) : 0;
    } else {
        return parseInt(coordStr);
    }
}

function parseCmdStructBlockWithStates(blockStr) {
    blockStr = blockStr.trim();
    const match = blockStr.match(/^([\w:]+)(?:\[(.*)\])?/);
    if (!match) {
        console.warn(`CmdStruct: Could not parse block string: ${blockStr}`);
        return [blockStr, {}];
    }

    const blockName = match[1];
    const statesStr = match[2] || '';
    const states = {};

    if (statesStr) {
        const statePairs = statesStr.match(/([\w:"\-]+)\s*=\s*([\w"\-.+]+)/g) || [];
        for (const pair of statePairs) {
            const [key, value] = pair.split('=').map(s => s.trim());
            const cleanKey = key.replace(/"/g, '');
            const valueLower = value.toLowerCase();

            if (valueLower === 'true') {
                states[cleanKey] = true;
            } else if (valueLower === 'false') {
                states[cleanKey] = false;
            } else {
                const numValue = parseInt(value);
                states[cleanKey] = isNaN(numValue) ? value.replace(/"/g, '') : numValue;
            }
        }
    }
    return [blockName, states];
}


function processCmdStructCommands(commandsText) {
    cmdStructBlocksMap = {}; // Reset
    let commandCount = 0;
    let errorCount = 0;
    const baseX = 0, baseY = 0, baseZ = 0;
    const commands = commandsText.split('\n');

    for (let lineNum = 0; lineNum < commands.length; lineNum++) {
        const cmd = commands[lineNum].trim();
        if (!cmd || cmd.startsWith('#')) continue;

        const parts = cmd.split(/\s+/);
        if (parts.length === 0) continue;

        const commandName = parts[0].toLowerCase();
        commandCount++;

        try {
            if (commandName === 'fill' && parts.length >= 8) {
                const x1 = baseX + parseCmdStructCoordinate(parts[1]);
                const y1 = baseY + parseCmdStructCoordinate(parts[2]);
                const z1 = baseZ + parseCmdStructCoordinate(parts[3]);
                const x2 = baseX + parseCmdStructCoordinate(parts[4]);
                const y2 = baseY + parseCmdStructCoordinate(parts[5]);
                const z2 = baseZ + parseCmdStructCoordinate(parts[6]);
                const blockStr = parts.slice(7).join(' ');
                const [blockName, states] = parseCmdStructBlockWithStates(blockStr);
                const startX = Math.min(x1, x2); const endX = Math.max(x1, x2);
                const startY = Math.min(y1, y2); const endY = Math.max(y1, y2);
                const startZ = Math.min(z1, z2); const endZ = Math.max(z1, z2);

                for (let x = startX; x <= endX; x++) {
                    if (!cmdStructBlocksMap[x]) cmdStructBlocksMap[x] = {};
                    for (let y = startY; y <= endY; y++) {
                        if (!cmdStructBlocksMap[x][y]) cmdStructBlocksMap[x][y] = {};
                        for (let z = startZ; z <= endZ; z++) {
                            cmdStructBlocksMap[x][y][z] = [blockName, { ...states }];
                        }
                    }
                }
            } else if (commandName === 'setblock' && parts.length >= 5) {
                const x = baseX + parseCmdStructCoordinate(parts[1]);
                const y = baseY + parseCmdStructCoordinate(parts[2]);
                const z = baseZ + parseCmdStructCoordinate(parts[3]);
                const blockStr = parts.slice(4).join(' ');
                const [blockName, states] = parseCmdStructBlockWithStates(blockStr);

                if (!cmdStructBlocksMap[x]) cmdStructBlocksMap[x] = {};
                if (!cmdStructBlocksMap[x][y]) cmdStructBlocksMap[x][y] = {};
                cmdStructBlocksMap[x][y][z] = [blockName, states];
            } else {
                console.warn(`CmdStruct: Skipping unrecognized command line ${lineNum + 1}: ${cmd}`);
                errorCount++;
            }
        } catch (e) {
            console.error(`CmdStruct: Error processing line ${lineNum + 1}: '${cmd}' - ${e.message}`);
            errorCount++;
        }
    }

    console.log(`CmdStruct: Processed ${commandCount} commands with ${errorCount} errors/warnings.`);
    if (Object.keys(cmdStructBlocksMap).length === 0) {
        console.warn("CmdStruct: Warning: No blocks parsed.");
    }
    return {
        commandCount,
        errorCount,
        blocksFound: Object.keys(cmdStructBlocksMap).length > 0
    };
}

function convertToStructureData() {
    try {
        console.log("CmdStruct: Starting conversion to structure data...");
        // Reset structure data object
        commandsToStructureData = {
            format_version: 1, size: [0, 0, 0], structure: { block_indices: [[], []], entities: [], palette: { default: { block_palette: [], block_position_data: {} } } }, structure_world_origin: [0, 0, 0]
        };

        const allX = Object.keys(cmdStructBlocksMap).map(Number);
        if (allX.length === 0) {
            return { success: false, message: "No blocks found. Cannot generate structure." };
        }

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;

        for (const xStr in cmdStructBlocksMap) {
            const x = Number(xStr); minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            for (const yStr in cmdStructBlocksMap[xStr]) {
                const y = Number(yStr); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
                for (const zStr in cmdStructBlocksMap[xStr][yStr]) {
                    const z = Number(zStr); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
                }
            }
        }

        const width = (maxX - minX + 1) || 1;
        const height = (maxY - minY + 1) || 1;
        const depth = (maxZ - minZ + 1) || 1;
        const totalVolume = width * height * depth;

        if (totalVolume > 10000000) {
            console.warn(`CmdStruct: WARNING: Very large structure with ${totalVolume} potential blocks (${width}x${height}x${depth})`);
        }
        console.log(`CmdStruct: Bounds: X(${minX}-${maxX}), Y(${minY}-${maxY}), Z(${minZ}-${maxZ}). Size: ${width}x${height}x${depth}`);

        const uniqueBlocks = new Map();
        const palette = [];
        let blockCount = 0;
        const blockIndicesLayer0 = [];
        const airIndex = -1;

        for (let x = minX; x <= maxX; x++) {
            const xBlocks = cmdStructBlocksMap[x];
            if (!xBlocks) {
                for (let y = minY; y <= maxY; y++) { for (let z = minZ; z <= maxZ; z++) { blockIndicesLayer0.push(airIndex); } } continue;
            }
            for (let y = minY; y <= maxY; y++) {
                const yBlocks = xBlocks[y];
                if (!yBlocks) {
                    for (let z = minZ; z <= maxZ; z++) { blockIndicesLayer0.push(airIndex); } continue;
                }
                for (let z = minZ; z <= maxZ; z++) {
                    const blockData = yBlocks[z];
                    if (blockData) {
                        blockCount++;
                        const [blockName, states] = blockData;
                        let blockIdStr = blockName;
                        if (!blockName.includes(':')) { blockIdStr = `minecraft:${blockName}`; }
                        const stateEntries = Object.entries(states || {}).sort((a, b) => a[0].localeCompare(b[0]));
                        const blockKey = JSON.stringify([blockIdStr, stateEntries]);

                        let paletteIndex;
                        if (!uniqueBlocks.has(blockKey)) {
                            paletteIndex = palette.length;
                            uniqueBlocks.set(blockKey, paletteIndex);
                            palette.push({ name: blockIdStr, states: states || {}, version: 18163713 }); // Using a recent version number
                        } else {
                            paletteIndex = uniqueBlocks.get(blockKey);
                        }
                        blockIndicesLayer0.push(paletteIndex);
                    } else {
                        blockIndicesLayer0.push(airIndex);
                    }
                }
            }
        }

        console.log(`CmdStruct: Found ${blockCount} blocks, created palette with ${palette.length} unique entries.`);
        if (blockIndicesLayer0.length !== totalVolume) {
            console.error(`CmdStruct: CRITICAL INDEXING ERROR: Final block_indices length (${blockIndicesLayer0.length}) does not match calculated volume (${totalVolume}). This structure WILL NOT load correctly.`);
        }

        const blockIndicesLayer1 = new Array(totalVolume).fill(-1);

        commandsToStructureData.size = [width, height, depth];
        commandsToStructureData.structure_world_origin = [minX, minY, minZ];
        commandsToStructureData.structure.block_indices = [blockIndicesLayer0, blockIndicesLayer1];
        commandsToStructureData.structure.palette.default.block_palette = palette;
        commandsToStructureData.structure.entities = [];
        commandsToStructureData.structure.palette.default.block_position_data = {};

        return {
            success: true, data: commandsToStructureData, dimensions: { width, height, depth },
            origin: [minX, minY, minZ], blockCount, paletteCount: palette.length
        };

    } catch (e) {
        console.error("CmdStruct: Critical error during conversion:", e);
        return { success: false, message: `Error during conversion: ${e.message}` };
    }
}

// ========================================================================== //
//                    NBT to Raw Command Extractor Logic                      //
// ========================================================================== //

// Global state for NBT to Raw tool
let nbtToRawFileContent = '';

// Regexes for command extraction
const nbtToRawPrimaryRegex = /"cmd_line"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
const nbtToRawFallbackRegex = /(setblock|fill)\s+~?-?\d+\s+~?-?\d+\s+~?-?\d+(?:\s+~?-?\d+\s+~?-?\d+\s+~?-?\d+)?\s+minecraft:[\w:]+(?:\[[^\]]*\])?/g;

// Post-processing function for extracted commands
function nbtToRawPostProcessCommands(commands) {
    console.log('NBTtoRaw: Starting post-processing...');
    const processed = commands.map(cmd => {
        // Triple backslash quotes seem specific to the Raw->NBT generator, clean them first
        let cleanedCmd = cmd.replace(/\\\\\\\"/g, '"');
        // Then handle standard escaped quotes if they exist
        cleanedCmd = cleanedCmd.replace(/\\\"/g, '"');
        return cleanedCmd.trim();
    });
    console.log(`NBTtoRaw: Finished post-processing ${processed.length} commands.`);
    return processed;
}

// ========================================================================== //
//                  Schematic to Commands Converter Logic                     //
// ========================================================================== //

// Global state for Schematic to Commands tool
let schemFileObject = null; // Store the File object

// VarInt Iterator (Helper for Schematic parsing)
function* varIntIterator(byteArray) {
    let index = 0;
    const dataView = new DataView(byteArray.buffer, byteArray.byteOffset, byteArray.byteLength);

    while (index < byteArray.length) {
        let value = 0;
        let shift = 0;
        let byte;
        do {
            if (index >= byteArray.length) {
                throw new Error("Schem: VarInt reading error: Reached end of buffer unexpectedly.");
            }
            byte = dataView.getUint8(index++);
            value |= (byte & 0x7F) << shift;
            shift += 7;
            if (shift > 35) {
                throw new Error("Schem: VarInt too big (more than 5 bytes)");
            }
        } while ((byte & 0x80) !== 0);
        yield value;
    }
}

// Creates mapping from Palette ID -> BlockState string
function createInvertedPalette(paletteNbt) {
    const inverted = new Map();
    if (!paletteNbt || typeof paletteNbt !== 'object') {
        throw new Error("Schem: Invalid palette format: Expected TAG_COMPOUND object.");
    }
    for (const [blockState, idTagValue] of Object.entries(paletteNbt)) {
        if (typeof idTagValue !== 'number') {
            console.warn(`Schem: Invalid palette entry value for ${blockState}. Skipping.`);
            continue;
        }
        inverted.set(idTagValue, blockState);
    }
    if (inverted.size === 0) {
        console.warn("Schem: Created an empty inverted palette.");
    }
    return inverted;
}

// Ends a run of identical blocks (used by generateCommands)
function endSchemBlockRun(commands, start, end, y, z, dx, dy, dz, blockType) {
    const runLength = end - start + 1;
    if (runLength <= 0) return;

    const startX = Math.floor(dx + start);
    const endX = Math.floor(dx + end);
    const currentY = Math.floor(dy + y);
    const currentZ = Math.floor(dz + z);

    if (typeof blockType !== 'string' || !blockType.includes(':')) {
        console.warn(`Schem: Skipping run due to invalid blockType: ${blockType}`);
        return;
    }

    // Bedrock commands use relative coords implicitly for setblock/fill
    if (runLength >= 3) {
        commands.push(`fill ~${startX} ~${currentY} ~${currentZ} ~${endX} ~${currentY} ~${currentZ} ${blockType}`);
    } else {
        for (let i = start; i <= end; i++) {
            const currentX = Math.floor(dx + i);
            commands.push(`setblock ~${currentX} ~${currentY} ~${currentZ} ${blockType}`);
        }
    }
}

// Main command generation function for Schematics
function generateSchemCommands(schematicData, dims, offset, includeAir) {
    if (!Array.isArray(dims) || dims.length !== 3 || dims.some(d => typeof d !== 'number' || d <= 0)) {
        throw new Error(`Schem: Invalid dimensions: ${JSON.stringify(dims)}.`);
    }
    if (!Array.isArray(offset) || offset.length !== 3 || offset.some(o => typeof o !== 'number')) {
        throw new Error(`Schem: Invalid offset: ${JSON.stringify(offset)}.`);
    }
    const [width, height, length] = dims.map(Math.floor);
    const [dx, dy, dz] = offset.map(Math.floor);

    let blockData;
    let paletteNbt;

    // Find Palette and BlockData (supporting different nesting)
    if (schematicData.Palette && schematicData.BlockData) {
        paletteNbt = schematicData.Palette;
        blockData = schematicData.BlockData;
    } else if (schematicData.Blocks && typeof schematicData.Blocks === 'object' && schematicData.Blocks.Data && schematicData.Blocks.Palette) {
        paletteNbt = schematicData.Blocks.Palette;
        blockData = schematicData.Blocks.Data; // Assume this is the byte array
    } else {
        console.error("Schem Data Keys:", Object.keys(schematicData));
        throw new Error("Schem: Could not find required keys: 'Palette' and 'BlockData'.");
    }

    if (typeof paletteNbt !== 'object' || paletteNbt === null) {
        throw new Error(`Schem: Invalid Palette type: Expected TAG_COMPOUND, got ${typeof paletteNbt}`);
    }
    if (!(blockData instanceof Uint8Array)) {
        if (Array.isArray(blockData) && blockData.every(b => typeof b === 'number')) {
             console.warn("Schem: BlockData was an Array, converting to Uint8Array.");
             blockData = new Uint8Array(blockData);
        } else {
            throw new Error(`Schem: Invalid BlockData type: Expected TAG_BYTE_ARRAY (Uint8Array), got ${blockData?.constructor?.name || typeof blockData}`);
        }
    }

    const expectedBlockCount = width * height * length;
    const invertedPalette = createInvertedPalette(paletteNbt);
    const iterator = varIntIterator(blockData);
    const commands = [];
    let blockIndex = 0;
    let currentY = 0; // For error reporting
    let currentZ = 0;

    try {
        for (let y = 0; y < height; y++) {
            currentY = y;
            for (let z = 0; z < length; z++) {
                currentZ = z;
                let runStart = null;
                let runBlockType = null;
                for (let x = 0; x < width; x++) {
                    const iteratorResult = iterator.next();
                    if (iteratorResult.done) {
                        console.warn(`Schem: BlockData stream ended prematurely at index ${blockIndex} (x=${x}, y=${y}, z=${z}). Expected ${expectedBlockCount}.`);
                        if (runStart !== null) endSchemBlockRun(commands, runStart, x - 1, y, z, dx, dy, dz, runBlockType);
                        throw new Error(`Schem: Ran out of block data at index ${blockIndex}. Expected ${expectedBlockCount}.`);
                    }
                    const paletteIndex = iteratorResult.value;
                    blockIndex++;

                    if (!invertedPalette.has(paletteIndex)) {
                        console.warn(`Schem: Palette index ${paletteIndex} not found at (x=${x}, y=${y}, z=${z}). Max index: ${invertedPalette.size - 1}. Skipping.`);
                        if (runStart !== null) {
                            endSchemBlockRun(commands, runStart, x - 1, y, z, dx, dy, dz, runBlockType);
                            runStart = null;
                        }
                        continue;
                    }
                    const blockType = invertedPalette.get(paletteIndex);

                    if (!includeAir && blockType === "minecraft:air") {
                        if (runStart !== null) {
                            endSchemBlockRun(commands, runStart, x - 1, y, z, dx, dy, dz, runBlockType);
                            runStart = null;
                        }
                        continue;
                    }

                    if (runStart === null) {
                        runStart = x;
                        runBlockType = blockType;
                    } else if (blockType !== runBlockType) {
                        endSchemBlockRun(commands, runStart, x - 1, y, z, dx, dy, dz, runBlockType);
                        runStart = x;
                        runBlockType = blockType;
                    }
                }
                if (runStart !== null) {
                    endSchemBlockRun(commands, runStart, width - 1, y, z, dx, dy, dz, runBlockType);
                }
            }
        }

        if (blockIndex < expectedBlockCount) {
            console.warn(`Schem: Processed ${blockIndex} blocks, expected ${expectedBlockCount}. BlockData might be shorter.`);
        }
        const finalIteratorResult = iterator.next();
        if (!finalIteratorResult.done) {
            console.warn(`Schem: BlockData stream has extra data after processing ${expectedBlockCount} blocks.`);
        }

    } catch (e) {
        console.error(`Schem: Error during command generation loop at approx (y=${currentY}, z=${currentZ}):`, e);
        return commands; // Return partial commands on error
    }

    console.log(`Schem: Generated ${commands.length} commands (Include Air: ${includeAir}). Processed ${blockIndex} block states.`);
    return commands;
}

// ========================================================================== //
//                      Java to Bedrock Translator                            //
// ========================================================================== //

// Global state for Java to Bedrock tool
let javaBedrockFileContent = '';

// NOTE: The actual translation logic (parseJavaCommand, javaToUniversal, etc.)
// is NOT included here. It runs on the server (server.js). This section
// only contains the client-side interaction logic (file handling, sending
// requests to the server).

// ========================================================================== //
//                           UI Interaction Logic                             //
// ========================================================================== //

document.addEventListener('DOMContentLoaded', function() {
    // --- General UI Elements ---
    const hamburgerButton = document.getElementById('hamburger-button');
    const sidebar = document.getElementById('sidebar');
    const sidebarLinks = document.querySelectorAll('#sidebar .tool-link');
    const toolSections = document.querySelectorAll('.tool-section');
    const closeSidebarButton = document.getElementById('close-sidebar-button'); // Added for closing

    // --- Tool Specific Elements ---
    // --- Tool Specific Elements ---
    // Raw to NBT (Example - adapted below)
    const rawToNbtInputFile_UI = document.getElementById('raw-to-nbt-input-file'); // Need unique names for DOM refs
    const rawToNbtDropArea_UI = document.getElementById('raw-to-nbt-drop-area');
    // ... other Raw to NBT UI elements ...


    // Commands to Structure
    const cmdStructDropArea = document.getElementById('cmd-struct-drop-area');
    const cmdStructInputFile = document.getElementById('cmd-struct-input-file');
    const cmdStructConvertButton = document.getElementById('cmd-struct-convert-button');
    const cmdStructOutputPreview = document.getElementById('cmd-struct-output-preview');
    const cmdStructPreviewContainer = document.getElementById('cmd-struct-preview-container');
    const cmdStructPreviewText = document.getElementById('cmd-struct-preview-text');
    const cmdStructDownloadButton = document.getElementById('cmd-struct-download-button');
    const cmdStructValidationMessage = document.getElementById('cmd-struct-validation-message');
    const cmdStructDropAreaText = cmdStructDropArea ? cmdStructDropArea.querySelector('p') : null;
    const cmdStructDefaultDropText = cmdStructDropAreaText ? cmdStructDropAreaText.textContent : 'Drag and drop your commands file here, or click to select one';


    // NBT to Raw
    const nbtToRawDropArea = document.getElementById('nbt-raw-drop-area');
    const nbtToRawInputFile = document.getElementById('nbt-raw-input-file');
    const nbtToRawExtractButton = document.getElementById('nbt-raw-extract-button');
    const nbtToRawOutputPreview = document.getElementById('nbt-raw-output-preview');
    const nbtToRawPreviewText = document.getElementById('nbt-raw-preview-text');
    const nbtToRawDownloadButton = document.getElementById('nbt-raw-download-button');
    const nbtToRawValidationMessage = document.getElementById('nbt-raw-validation-message');
    // const nbtToRawDropAreaText = nbtToRawDropArea ? nbtToRawDropArea.querySelector('p') : null; // Handled by generic setup
    // const nbtToRawDefaultDropText = nbtToRawDropAreaText ? nbtToRawDropAreaText.textContent : 'Drag & drop NBT/TXT file or click';
    const nbtToRawFilterCheckbox = document.getElementById('nbt-raw-filter-checkbox'); // Reference to the checkbox

    // Schematic to Commands
    const schemDropArea = document.getElementById('schem-drop-area');
    const schemInputFile = document.getElementById('schem-input-file');
    const schemFileNameDisplay = document.getElementById('schem-file-name');
    const schemGenerateButton = document.getElementById('schem-generate-button');
    const schemOutputNameInput = document.getElementById('schem-outputName');
    const schemIncludeAirCheckbox = document.getElementById('schem-includeAir');
    const schemOffsetXInput = document.getElementById('schem-offsetX');
    const schemOffsetYInput = document.getElementById('schem-offsetY');
    const schemOffsetZInput = document.getElementById('schem-offsetZ');
    const schemStatusDiv = document.getElementById('schem-status');
    const schemDefaultDropText = 'Drag and drop your .schem file here, or click to select';

    // Java to Bedrock
    const javaBedrockDropArea = document.getElementById('java-bedrock-drop-area');
    const javaBedrockInputFile = document.getElementById('java-bedrock-input-file');
    const javaBedrockTranslateButton = document.getElementById('java-bedrock-translate-button');
    const javaBedrockOutputPreview = document.getElementById('java-bedrock-output-preview');
    const javaBedrockPreviewText = document.getElementById('java-bedrock-preview-text');
    const javaBedrockDownloadButton = document.getElementById('java-bedrock-download-button');
    const javaBedrockValidationMessage = document.getElementById('java-bedrock-validation-message');
    const javaBedrockDropAreaText = javaBedrockDropArea ? javaBedrockDropArea.querySelector('p') : null;
    const javaBedrockDefaultDropText = javaBedrockDropAreaText ? javaBedrockDropAreaText.textContent : 'Drag and drop your Java commands file here, or click to select one';


    // --- Helper Functions ---
    function showValidationMessage(element, message, type = 'error') {
        if (!element) return;
        element.textContent = message;
        element.className = 'validation-message'; // Reset classes
        element.style.display = 'block';

        if (type === 'success') {
            element.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
            element.style.borderLeftColor = '#2ecc71';
            element.style.color = '#2ecc71';
        } else if (type === 'info') {
            element.style.backgroundColor = 'rgba(52, 152, 219, 0.1)';
            element.style.borderLeftColor = '#3498db';
            element.style.color = '#3498db';
        } else { // error
            element.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
            element.style.borderLeftColor = '#ff3b3b';
            element.style.color = '#ff6b6b';
        }

        // Auto-hide non-info messages
        if (type !== 'info') {
            setTimeout(() => {
                 if (element.style.display === 'block' && element.textContent === message) {
                     element.style.display = 'none';
                 }
            }, 5000);
        }
    }

    function hideValidationMessage(element) {
        if (element) {
            element.textContent = '';
            element.style.display = 'none';
        }
    }

    // Generic Drop Area Setup
    function setupDropArea(dropArea, fileInput, defaultTextElement, defaultTextContent) {
        if (!dropArea || !fileInput || !defaultTextElement) return;

        const clickHandler = () => {
            fileInput.click();
        };
        dropArea.addEventListener('click', clickHandler);

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
        });
        ['dragenter', 'dragover'].forEach(eventName => {
            dropArea.addEventListener(eventName, () => dropArea.classList.add('dragover'), false);
        });
        ['dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, () => dropArea.classList.remove('dragover'), false);
        });

        dropArea.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length > 0) {
                fileInput.files = files; // Assign files to the hidden input
                // Manually trigger the 'change' event on the file input
                const event = new Event('change', { bubbles: true });
                fileInput.dispatchEvent(event);
            }
        }, false);

        // Update drop area text when file is selected (via click or drop)
        fileInput.addEventListener('change', () => {
             if (fileInput.files.length > 0) {
                 // Basic validation (can be overridden by specific tool handler)
                const file = fileInput.files[0];
                const allowedTypes = fileInput.accept.split(',');
                let isValid = false;
                if (allowedTypes.includes('.txt') && file.type === 'text/plain') isValid = true;
                if (allowedTypes.includes('.mcstructure') && file.name.toLowerCase().endsWith('.mcstructure')) isValid = true;
                 if (allowedTypes.includes('.nbt') && file.name.toLowerCase().endsWith('.nbt')) isValid = true; // Added NBT
                 if (allowedTypes.includes('.schem') && file.name.toLowerCase().endsWith('.schem')) isValid = true; // Added schem
                 if (allowedTypes.includes('.schematic') && file.name.toLowerCase().endsWith('.schematic')) isValid = true; // Added schematic


                if (isValid || fileInput.accept === '') { // Accept if valid or no specific type required
                    defaultTextElement.textContent = file.name;
                    // Trigger file reading if needed (handled by specific tool listeners)
                } else {
                     defaultTextElement.textContent = `Invalid file type: ${file.name}`;
                     fileInput.value = ''; // Clear invalid selection
                }
             } else {
                 defaultTextElement.textContent = defaultTextContent;
             }
        });
    }

     function resetDropArea(dropArea, fileInput, defaultTextElement, defaultTextContent) {
        if (dropArea && fileInput && defaultTextElement) {
            dropArea.innerHTML = `<i class="fas fa-file-upload"></i><p>${defaultTextContent}</p><input type="file" id="${fileInput.id}" accept="${fileInput.accept}" class="file-input">`;
            // Re-attach listeners to the new input element
            const newFileInput = document.getElementById(fileInput.id);
            const newDropAreaText = dropArea.querySelector('p');
            if (newFileInput && newDropAreaText) {
                setupDropArea(dropArea, newFileInput, newDropAreaText, defaultTextContent);
                // Also re-attach specific tool's 'change' listener if necessary
                attachFileInputChangeListener(newFileInput.id);
            }
        }
     }

    // --- Navigation Logic ---
    if (hamburgerButton && sidebar) {
        hamburgerButton.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent click from closing immediately if sidebar overlaps button
            sidebar.classList.toggle('active');
        });
    }

    if (closeSidebarButton && sidebar) {
         closeSidebarButton.addEventListener('click', () => {
             sidebar.classList.remove('active');
         });
     }

    // Close sidebar if clicking outside of it
    document.addEventListener('click', (e) => {
        if (sidebar && sidebar.classList.contains('active') && !sidebar.contains(e.target) && e.target !== hamburgerButton) {
            sidebar.classList.remove('active');
        }
    });

    sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetToolId = link.getAttribute('data-tool');

            // Hide all tool sections
            toolSections.forEach(section => {
                section.style.display = 'none';
                 section.classList.remove('active');
            });

            // Show the target tool section
            const targetSection = document.getElementById(targetToolId);
            if (targetSection) {
                targetSection.style.display = 'block';
                targetSection.classList.add('active');
                console.log(`Switched to tool: ${targetToolId}`);
            } else {
                console.error(`Tool section with ID ${targetToolId} not found.`);
            }

            // Hide sidebar after selection
            if (sidebar) {
                sidebar.classList.remove('active');
            }

            // Optional: Update header/title? (Add element if needed)
            // document.getElementById('current-tool-title').textContent = link.textContent;
        });
    });

    // --- Initialization: Hide all tool sections except the first one ---
    toolSections.forEach((section, index) => {
        if (index === 0) {
            section.style.display = 'block'; // Show the first tool by default
             section.classList.add('active');
        } else {
            section.style.display = 'none';
        }
    });


    // ========================================================== //
    //                TOOL SPECIFIC EVENT LISTENERS               //
    // ========================================================== //

    // --- Raw to NBT Listeners (Exact structure from user provided file) ---

    // Get DOM elements using specific IDs from index.html
    const rawToNbtDropArea = document.getElementById('raw-to-nbt-drop-area');
    const rawToNbtInputFile = document.getElementById('raw-to-nbt-input-file');
    const rawToNbtGenerateButton = document.getElementById('raw-to-nbt-generate-button');
    const rawToNbtNbtTitleInput = document.getElementById('raw-to-nbt-nbt-title');
    const rawToNbtBytesInput = document.getElementById('raw-to-nbt-bytes-per-npc');
    const rawToNbtPreviewArea = document.getElementById('raw-to-nbt-output-preview');
    const rawToNbtPreviewTextarea = document.getElementById('raw-to-nbt-preview-text');
    const rawToNbtDownloadBtn = document.getElementById('raw-to-nbt-download-button');
    const rawToNbtValidationMsg = document.getElementById('raw-to-nbt-validation-message');

    // File reading function (Specific to RawToNbt as defined in the provided script)
    function rawToNbtReadFile(file) {
      const reader = new FileReader();
      reader.onload = function(e) {
        rawToNbtFileContent = e.target.result; // Use the global variable
        const dropAreaTextElement = rawToNbtDropArea.querySelector('span.file-name-display'); // Use the span for filename
        if (dropAreaTextElement) {
             dropAreaTextElement.textContent = `${file.name} loaded. Ready to generate NBT.`;
        }
        rawToNbtPreviewArea.style.display = 'none'; // Hide previous results
        rawToNbtDownloadBtn.disabled = true;
        hideValidationMessage(rawToNbtValidationMsg); // Use shared helper

      };
      reader.onerror = function() {
           showValidationMessage(rawToNbtValidationMsg, 'Error reading file.', 'error'); // Use shared helper
           rawToNbtResetTool(); // Call reset function
      };
      reader.readAsText(file);
    }

    // Function to attach drop area events (Specific to RawToNbt)
    function rawToNbtAttachDropAreaEvents() {
      if(rawToNbtDropArea) {
        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
          rawToNbtDropArea.addEventListener(eventName, preventDefaults, false);
          document.body.addEventListener(eventName, preventDefaults, false);
        });
        ['dragenter', 'dragover'].forEach(eventName => {
          rawToNbtDropArea.addEventListener(eventName, highlight, false);
        });
        ['dragleave', 'drop'].forEach(eventName => {
          rawToNbtDropArea.addEventListener(eventName, unhighlight, false);
        });
        rawToNbtDropArea.addEventListener('drop', handleDrop, false);

        function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }
        function highlight() { rawToNbtDropArea.classList.add('dragover'); }
        function unhighlight() { rawToNbtDropArea.classList.remove('dragover'); }

        function handleDrop(e) {
          const dt = e.dataTransfer;
          const files = dt.files;
          if (files.length > 0) {
               const file = files[0];
               // Check if it's a text file
               if (file.type === "" || file.type === "text/plain" || file.name.toLowerCase().endsWith('.txt')) {
                   rawToNbtInputFile.files = files; // Assign to input
                   const event = new Event('change', { bubbles: true });
                   rawToNbtInputFile.dispatchEvent(event); // Trigger change for consistency
                   // rawToNbtReadFile(file); // Reading now handled by input change
               } else {
                   showValidationMessage(rawToNbtValidationMsg, 'Please drop a .txt file.'); // Use shared helper
               }
           }
        }
      }
    }

    // Function to reset the Raw to NBT section (Specific to RawToNbt)
    function rawToNbtResetTool() {
        rawToNbtFileContent = '';
        const dropAreaTextElement = rawToNbtDropArea.querySelector('span.file-name-display');
        if(dropAreaTextElement) dropAreaTextElement.textContent = 'No file selected';
        rawToNbtPreviewArea.style.display = 'none';
        rawToNbtNbtTitleInput.value = '';
        rawToNbtBytesInput.value = '2000';
        hideValidationMessage(rawToNbtValidationMsg);
        rawToNbtDownloadBtn.disabled = true;
        rawToNbtInputFile.value = ''; // Clear file input

        // Reattach click handler for the drop area
        if (rawToNbtDropArea) {
            rawToNbtDropArea.onclick = function() {
                rawToNbtInputFile.click();
            };
        }
        // Reattach drag/drop
        rawToNbtAttachDropAreaEvents();
    }


    // Initial setup for Raw to NBT file input click and change
    if(rawToNbtDropArea && rawToNbtInputFile) {
        rawToNbtDropArea.onclick = function() {
            // Allow reset only if output is visible? Or always allow selection?
            // For robustness, always allow selecting a new file.
             if (rawToNbtPreviewArea.style.display === 'block') {
                 // Optionally reset the state if a file was processed
                 console.log("RawToNBT: Resetting tool state on drop area click after generation.");
                 rawToNbtResetTool(); // Reset before triggering click
                 // rawToNbtInputFile.click(); // Should happen anyway due to reset? Test this.
             }
            rawToNbtInputFile.click();
        };

        rawToNbtInputFile.onchange = function(e) { // Use onchange for direct assignment
            const file = e.target.files[0];
            if (file) {
                if (file.type === "" || file.type === "text/plain" || file.name.toLowerCase().endsWith('.txt')) {
                    rawToNbtReadFile(file);
                } else {
                    showValidationMessage(rawToNbtValidationMsg, 'Please select a .txt file.');
                    rawToNbtResetTool(); // Reset on invalid file type
                }
            } else {
                 rawToNbtResetTool(); // Reset if selection is cancelled
            }
        };
    }

    // Initially attach drag and drop event listeners for Raw to NBT
    rawToNbtAttachDropAreaEvents();

    // Generate NBT button event listener (Specific to RawToNbt)
    if(rawToNbtGenerateButton) {
      rawToNbtGenerateButton.addEventListener('click', () => {
        if (!rawToNbtFileContent) { // Check specific global variable
          showValidationMessage(rawToNbtValidationMsg, 'Please select a file.'); // Use specific validation element
          return;
        }

        const nbtTitle = rawToNbtNbtTitleInput.value.trim(); // Use specific input element
        const maxBytesInput = rawToNbtBytesInput.value.trim(); // Use specific input element
        let maxBytes;
        try {
          maxBytes = parseInt(maxBytesInput, 10);
          if (isNaN(maxBytes) || maxBytes <= 500) throw new Error("Value too small"); // Adjusted minimum
        } catch(e) {
          showValidationMessage(rawToNbtValidationMsg, 'Please enter a valid positive integer (> 500) for Max Bytes per NPC.');
          return;
        }
        hideValidationMessage(rawToNbtValidationMsg); // Hide previous messages

        try {
            showValidationMessage(rawToNbtValidationMsg, 'Generating NBT...', 'info');
             // --- NBT Generation Logic (using functions defined above) ---
             const commands = getUsefulCommands(rawToNbtFileContent);
             const { normalCommands, equalsCommands } = separateCommands(commands);
             const nbtName = nbtTitle || 'Blacklight NBT'; // Use default if no title

             let nbtData = getBlockOpener(nbtName);
             let curSec = 0;
             let combinedNpcData = [];

             if (normalCommands.length > 0) {
                 const result = processNpcCommandsByBytes(normalCommands, maxBytes, nbtName, curSec, commandJoinerNormal, false);
                 if (result.npcData) combinedNpcData.push(result.npcData);
                 curSec += result.count;
             }

             if (equalsCommands.length > 0) {
                 const result = processNpcCommandsByBytes(equalsCommands, maxBytes, nbtName, curSec, commandJoinerEquals, true);
                  if (result.npcData) combinedNpcData.push(result.npcData);
                 // curSec += result.count; // Not needed if last
             }

             nbtData += combinedNpcData.join(',');
             nbtData += getBlockCloser();
             // --- End NBT Generation Logic ---


             // Display preview
             rawToNbtPreviewTextarea.value = nbtData;
             rawToNbtPreviewArea.style.display = 'block';
             rawToNbtDownloadBtn.disabled = false;
             hideValidationMessage(rawToNbtValidationMsg); // Hide info message
             showValidationMessage(rawToNbtValidationMsg, 'NBT generated successfully!', 'success');

        } catch (e) {
             console.error("RawToNBT Generation Error:", e);
             hideValidationMessage(rawToNbtValidationMsg);
             showValidationMessage(rawToNbtValidationMsg, `Error generating NBT: ${e.message}`, 'error');
             rawToNbtPreviewArea.style.display = 'none';
             rawToNbtDownloadBtn.disabled = true;
         }
      });
    }

    // Download button event listener (Specific to RawToNbt)
    if(rawToNbtDownloadBtn) {
      rawToNbtDownloadBtn.addEventListener('click', () => {
        const nbtText = rawToNbtPreviewTextarea.value;
        if (!nbtText) {
            showValidationMessage(rawToNbtValidationMsg, 'No NBT data generated to download.');
            return;
        }
        const nbtTitle = rawToNbtNbtTitleInput.value.trim();
        const nbtName = nbtTitle || 'Blacklight_NBT'; // Use underscore
        const fileName = `Horion ${nbtName} Build.txt`; // Match original naming

        const blob = new Blob([nbtText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showValidationMessage(rawToNbtValidationMsg, 'NBT file download started.', 'success');
      });
    }
    // --- End Raw to NBT Listeners ---

    // --- Commands to Structure Listeners ---
     function handleCmdStructFileRead(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            cmdStructFileContent = e.target.result;
            if (cmdStructDropAreaText) cmdStructDropAreaText.textContent = `${file.name} loaded.`;
            hideValidationMessage(cmdStructValidationMessage);
            cmdStructOutputPreview.style.display = 'none'; // Hide old results
            cmdStructDownloadButton.disabled = true;
            console.log("CmdStruct: File read successfully.");
        };
        reader.onerror = function() {
            showValidationMessage(cmdStructValidationMessage, 'Error reading file.', 'error');
            resetDropArea(cmdStructDropArea, cmdStructInputFile, cmdStructDropAreaText, cmdStructDefaultDropText);
            cmdStructFileContent = '';
        };
        reader.readAsText(file);
    }

     if (cmdStructDropArea && cmdStructInputFile && cmdStructDropAreaText) {
        setupDropArea(cmdStructDropArea, cmdStructInputFile, cmdStructDropAreaText, cmdStructDefaultDropText);
         cmdStructInputFile.addEventListener('change', () => {
             if (cmdStructInputFile.files.length > 0) {
                 const file = cmdStructInputFile.files[0];
                 if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
                     handleCmdStructFileRead(file);
                 } else {
                     showValidationMessage(cmdStructValidationMessage, 'Please select a .txt file.', 'error');
                     resetDropArea(cmdStructDropArea, cmdStructInputFile, cmdStructDropAreaText, cmdStructDefaultDropText);
                     cmdStructFileContent = '';
                 }
             } else {
                 cmdStructFileContent = '';
             }
        });
    }

    if (cmdStructConvertButton) {
        cmdStructConvertButton.addEventListener('click', () => {
            if (!cmdStructFileContent) {
                showValidationMessage(cmdStructValidationMessage, 'Please select a file with Minecraft commands.', 'error');
                return;
            }
            hideValidationMessage(cmdStructValidationMessage);
            showValidationMessage(cmdStructValidationMessage, 'Processing commands...', 'info');

            // Use timeout for UI responsiveness during potentially long processing
            setTimeout(() => {
                try {
                    const processResult = processCmdStructCommands(cmdStructFileContent);
                    if (!processResult.blocksFound) {
                         hideValidationMessage(cmdStructValidationMessage); // Clear info
                        showValidationMessage(cmdStructValidationMessage, 'No valid blocks found in commands. Check file format.', 'error');
                        cmdStructOutputPreview.style.display = 'none';
                        return;
                    }

                    const result = convertToStructureData();
                    if (!result.success) {
                        hideValidationMessage(cmdStructValidationMessage); // Clear info
                        showValidationMessage(cmdStructValidationMessage, result.message || 'Failed to convert structure data.', 'error');
                        cmdStructOutputPreview.style.display = 'none';
                        return;
                    }

                    // Display results
                    const previewJson = JSON.stringify(result.data, null, 2);
                    cmdStructPreviewText.textContent = previewJson;

                    // Remove old stats if present
                    const existingStats = cmdStructPreviewContainer.querySelector('.alert.alert-info');
                    if (existingStats) existingStats.remove();

                    // Add new stats
                    const statsHtml = `
                    <div class="alert alert-info mt-3 mb-3">
                      <p class="mb-1"><strong>Structure Dimensions:</strong> ${result.dimensions.width}×${result.dimensions.height}×${result.dimensions.depth}</p>
                      <p class="mb-1"><strong>World Origin Offset:</strong> [${result.origin.join(', ')}]</p>
                      <p class="mb-1"><strong>Actual Block Count:</strong> ${result.blockCount}</p>
                      <p class="mb-0"><strong>Unique Block Types (Palette Size):</strong> ${result.paletteCount}</p>
                    </div>`;
                    cmdStructPreviewText.insertAdjacentHTML('beforebegin', statsHtml);

                    cmdStructOutputPreview.style.display = 'block';
                    cmdStructDownloadButton.disabled = false;
                    hideValidationMessage(cmdStructValidationMessage); // Clear info
                    showValidationMessage(cmdStructValidationMessage, 'Conversion successful. Preview generated.', 'success');

                } catch (e) {
                    console.error("CmdStruct Error:", e);
                     hideValidationMessage(cmdStructValidationMessage); // Clear info
                    showValidationMessage(cmdStructValidationMessage, `Error during conversion: ${e.message}`, 'error');
                    cmdStructOutputPreview.style.display = 'none';
                    cmdStructDownloadButton.disabled = true;
                }
            }, 50); // 50ms timeout
        });
    }

     if (cmdStructDownloadButton) {
        cmdStructDownloadButton.addEventListener('click', () => {
            if (!commandsToStructureData || !commandsToStructureData.size || commandsToStructureData.size.some(dim => dim === 0)) {
                showValidationMessage(cmdStructValidationMessage, 'No structure data generated. Convert commands first.', 'error');
                return;
            }
            hideValidationMessage(cmdStructValidationMessage); // Clear previous messages

            showValidationMessage(cmdStructValidationMessage, 'Creating NBT buffer...', 'info');

            setTimeout(() => { // Timeout for UI update
                try {
                    const nbtBuffer = createNbtBuffer(commandsToStructureData); // Use shared NBT function
                    console.log(`CmdStruct: NBT buffer created, size: ${nbtBuffer.byteLength} bytes.`);

                    const blob = new Blob([nbtBuffer], { type: 'application/octet-stream' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    const fileName = 'structure.mcstructure'; // Standard name
                    a.href = url;
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);

                    hideValidationMessage(cmdStructValidationMessage); // Clear info
                    showValidationMessage(cmdStructValidationMessage, 'Structure file download started!', 'success');

                } catch (bufferError) {
                    console.error("CmdStruct: Error creating/downloading .mcstructure file:", bufferError);
                    hideValidationMessage(cmdStructValidationMessage); // Clear info
                    showValidationMessage(cmdStructValidationMessage, `Error: ${bufferError.message}. Structure might be too large.`, 'error');
                }
            }, 100); // 100ms timeout for NBT generation
        });
    }

    // --- NBT to Raw Listeners ---
    function handleNbtToRawFileRead(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            nbtToRawFileContent = e.target.result;
             const fileNameDisplay = nbtToRawDropArea.querySelector('span.file-name-display');
            if (fileNameDisplay) fileNameDisplay.textContent = `${file.name} loaded.`;
            hideValidationMessage(nbtToRawValidationMessage);
            nbtToRawOutputPreview.style.display = 'none'; // Hide old results
            nbtToRawDownloadButton.disabled = true;
            console.log("NBTtoRaw: File read successfully.");
        };
        reader.onerror = function() {
            showValidationMessage(nbtToRawValidationMessage, 'Error reading file.', 'error');
             const fileNameDisplay = nbtToRawDropArea.querySelector('span.file-name-display');
             if (fileNameDisplay) fileNameDisplay.textContent = 'Error reading file';
             nbtToRawInputFile.value = '';
            nbtToRawFileContent = '';
        };
        reader.readAsText(file); // Reads as text for pattern matching
    }

     if (nbtToRawDropArea && nbtToRawInputFile) {
        const dropAreaTextElement = nbtToRawDropArea.querySelector('p');
        const defaultText = dropAreaTextElement ? dropAreaTextElement.textContent : '';
         const fileNameDisplay = nbtToRawDropArea.querySelector('span.file-name-display');
        setupDropArea(nbtToRawDropArea, nbtToRawInputFile, fileNameDisplay, 'No file selected');
         nbtToRawInputFile.addEventListener('change', () => {
             if (nbtToRawInputFile.files.length > 0) {
                const file = nbtToRawInputFile.files[0];
                const lowerName = file.name.toLowerCase();
                if (file.type === 'text/plain' || lowerName.endsWith('.txt') || lowerName.endsWith('.nbt') || lowerName.endsWith('.mcstructure')) {
                    handleNbtToRawFileRead(file);
                } else {
                    nbtToRawFileContent = '';
                }
             } else {
                 nbtToRawFileContent = '';
             }
        });
    }

     if (nbtToRawExtractButton) {
        nbtToRawExtractButton.addEventListener('click', () => {
            if (!nbtToRawFileContent) {
                showValidationMessage(nbtToRawValidationMessage, 'Please select or drop a file first.', 'error');
                return;
            }
            hideValidationMessage(nbtToRawValidationMessage);
            nbtToRawOutputPreview.style.display = 'none';
            nbtToRawPreviewText.value = '';

            try {
                showValidationMessage(nbtToRawValidationMessage, 'Extracting commands...', 'info');
                const data = nbtToRawFileContent;
                const filterActive = nbtToRawFilterCheckbox.checked;

                const cmdLineMatches = Array.from(data.matchAll(nbtToRawPrimaryRegex), match => match[1]);
                const fallbackMatches = Array.from(data.matchAll(nbtToRawFallbackRegex), match => match[0]);
                const uniqueRawCommands = [...new Set([...cmdLineMatches, ...fallbackMatches])];
                let processedCommands = nbtToRawPostProcessCommands(uniqueRawCommands);

                let finalCommands = processedCommands;
                if (filterActive) {
                    console.log("NBTtoRaw: Filtering for fill/setblock commands.");
                    finalCommands = processedCommands.filter(cmd => {
                        const trimmedCmd = cmd.trim().toLowerCase();
                        return trimmedCmd.startsWith('fill ') || trimmedCmd.startsWith('setblock ');
                    });
                    console.log(`NBTtoRaw: Filtered down to ${finalCommands.length} commands.`);
                }

                if (finalCommands.length > 0) {
                    nbtToRawPreviewText.value = finalCommands.join('\n');
                    hideValidationMessage(nbtToRawValidationMessage);
                    showValidationMessage(nbtToRawValidationMessage, `Extracted ${finalCommands.length} unique commands${filterActive ? ' (filtered)' : ''}.`, 'success');
                } else {
                    nbtToRawPreviewText.value = `// No commands matching the patterns${filterActive ? ' (and filter)' : ''} were found.`;
                    hideValidationMessage(nbtToRawValidationMessage);
                    showValidationMessage(nbtToRawValidationMessage, `No matching commands found${filterActive ? ' after filtering' : ''}.`, 'info');
                }
                nbtToRawOutputPreview.style.display = 'block';
                nbtToRawDownloadButton.disabled = (finalCommands.length === 0);


            } catch (err) {
                console.error("NBTtoRaw Error:", err);
                hideValidationMessage(nbtToRawValidationMessage);
                showValidationMessage(nbtToRawValidationMessage, `An error occurred during processing: ${err.message}`, 'error');
                nbtToRawOutputPreview.style.display = 'none';
                nbtToRawDownloadButton.disabled = true;
            }
        });
    }

     if (nbtToRawDownloadButton) {
        nbtToRawDownloadButton.addEventListener('click', () => {
            const textToSave = nbtToRawPreviewText.value;
            if (!textToSave || textToSave.startsWith("// No commands matching")) {
                showValidationMessage(nbtToRawValidationMessage, "There is no valid command content to download.", 'error');
                return;
            }

            const originalFileName = nbtToRawInputFile.files[0]?.name || 'commands';
            const baseName = originalFileName.replace(/\.[^/.]+$/, "");
            const blob = new Blob([textToSave], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `${baseName}_extracted_commands.txt`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            console.log(`NBTtoRaw: Downloaded extracted commands as ${a.download}`);
            showValidationMessage(nbtToRawValidationMessage, 'Commands file download started.', 'success');
        });
    }

    // --- Schematic to Commands Listeners ---
    function displaySchemStatus(message, type = 'info') {
        if (!schemStatusDiv) return;
        schemStatusDiv.textContent = message;
        schemStatusDiv.className = 'status-message'; // Reset classes
        if (type === 'error') {
            schemStatusDiv.classList.add('error');
        } else if (type === 'success') {
            schemStatusDiv.classList.add('success');
        }
        schemStatusDiv.style.display = 'block';
    }
     function hideSchemStatus() {
        if(schemStatusDiv) schemStatusDiv.style.display = 'none';
     }

    function handleSchemFileSelect(file) {
         if (!file.name.toLowerCase().endsWith('.schem') && !file.name.toLowerCase().endsWith('.schematic')) {
            displaySchemStatus(`Invalid file type: ${file.name}. Please select a .schem or .schematic file.`, 'error');
            if (schemFileNameDisplay) schemFileNameDisplay.textContent = 'Invalid file type';
            if (schemInputFile) schemInputFile.value = ''; // Clear the input
            schemFileObject = null;
            return;
        }
        schemFileObject = file;
        if (schemFileNameDisplay) schemFileNameDisplay.textContent = file.name;
        hideSchemStatus();
        console.log("Schem: File selected:", file.name);
    }

    if (schemDropArea && schemInputFile && schemFileNameDisplay) {
         // Slightly different setup as it uses a span for filename
         schemDropArea.addEventListener('click', () => schemInputFile.click());

         ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            schemDropArea.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); }, false);
         });
         ['dragenter', 'dragover'].forEach(eventName => {
             schemDropArea.addEventListener(eventName, () => schemDropArea.classList.add('dragover'), false);
         });
         ['dragleave', 'drop'].forEach(eventName => {
             schemDropArea.addEventListener(eventName, () => schemDropArea.classList.remove('dragover'), false);
         });

         schemDropArea.addEventListener('drop', (e) => {
             const dt = e.dataTransfer;
             const files = dt.files;
             if (files.length > 0) {
                 handleSchemFileSelect(files[0]); // Use handler directly
             }
         }, false);

         schemInputFile.addEventListener('change', () => {
             if (schemInputFile.files.length > 0) {
                 handleSchemFileSelect(schemInputFile.files[0]);
             } else {
                 schemFileNameDisplay.textContent = 'No file selected';
                 schemFileObject = null;
             }
         });
     }

     if (schemGenerateButton) {
        schemGenerateButton.addEventListener('click', () => {
            const file = schemFileObject; // Use stored file object
            const outputName = schemOutputNameInput.value.trim() || 'Commands';
            const includeAir = schemIncludeAirCheckbox.checked;
            const offsetX = parseInt(schemOffsetXInput.value) || 0;
            const offsetY = parseInt(schemOffsetYInput.value) || 0;
            const offsetZ = parseInt(schemOffsetZInput.value) || 0;

            if (!file) {
                displaySchemStatus('Please select a .schem or .schematic file first!', 'error');
                return;
            }

            displaySchemStatus('Reading file...', 'info');
            schemGenerateButton.disabled = true;

            const reader = new FileReader();
            reader.onload = function(event) {
                try {
                    displaySchemStatus('Decompressing and parsing schematic...', 'info');
                    const compressedData = new Uint8Array(event.target.result);
                    let nbtDataBuffer;

                    if (compressedData[0] === 0x1f && compressedData[1] === 0x8b) {
                        const decompressedData = pako.inflate(compressedData); // Pako dependency
                        nbtDataBuffer = decompressedData.buffer;
                    } else {
                         console.warn("Schem: File not Gzipped. Attempting uncompressed parse.");
                         nbtDataBuffer = compressedData.buffer;
                    }

                    const schematicNbt = loadSchematicNBT(nbtDataBuffer); // Use shared NBT reader

                    let width, height, length, dataContainer;
                    // Determine dimensions and data source (root or nested)
                    if (typeof schematicNbt.Width === 'number' && typeof schematicNbt.Height === 'number' && typeof schematicNbt.Length === 'number') {
                        width = schematicNbt.Width; height = schematicNbt.Height; length = schematicNbt.Length; dataContainer = schematicNbt;
                    } else if (schematicNbt.Schematic && typeof schematicNbt.Schematic === 'object' && typeof schematicNbt.Schematic.Width === 'number') {
                         width = schematicNbt.Schematic.Width; height = schematicNbt.Schematic.Height; length = schematicNbt.Schematic.Length; dataContainer = schematicNbt.Schematic;
                         console.log("Schem: Detected nested dimensions (Sponge V3 style?)");
                    } else {
                        console.error("Schem Parsed NBT:", schematicNbt);
                        throw new Error("Missing dimension tags (Width, Height, Length) in schematic NBT.");
                    }

                    if (width <= 0 || height <= 0 || length <= 0) {
                        throw new Error(`Invalid dimensions found: W=${width}, H=${height}, L=${length}`);
                    }
                    const dims = [width, height, length];
                    const offset = [offsetX, offsetY, offsetZ];

                    displaySchemStatus(`Generating commands for ${width}x${height}x${length} schematic...`, 'info');

                    const commands = generateSchemCommands(dataContainer, dims, offset, includeAir); // Use schem-specific generator

                    if (commands.length === 0) {
                        displaySchemStatus('Warning: No commands generated. Schematic might be empty or only contain air.', 'info');
                        schemGenerateButton.disabled = false;
                        return;
                    }

                    // Create and Download File
                    const now = new Date();
                    const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
                    const commandsText = commands.join('\n');
                    const blob = new Blob([commandsText], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${outputName}_${timestamp}.txt`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);

                    displaySchemStatus(`Success! ${commands.length} commands generated and download started.`, 'success');

                } catch (e) {
                    console.error("Schem Error processing:", e);
                    displaySchemStatus(`Error: ${e.message}`, 'error');
                } finally {
                    schemGenerateButton.disabled = false;
                }
            }; // end reader.onload

            reader.onerror = () => {
                displaySchemStatus('Error reading the selected file.', 'error');
                schemGenerateButton.disabled = false;
            };
            reader.readAsArrayBuffer(file);
        });
    }

    // --- Java to Bedrock Listeners ---
    function handleJavaBedrockFileRead(file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            javaBedrockFileContent = e.target.result;
            if (javaBedrockDropAreaText) javaBedrockDropAreaText.textContent = `${file.name} loaded.`;
            hideValidationMessage(javaBedrockValidationMessage);
            javaBedrockOutputPreview.style.display = 'none'; // Hide old results
            javaBedrockDownloadButton.disabled = true;
            console.log("Java->Bedrock: File read successfully.");
        };
        reader.onerror = function() {
            showValidationMessage(javaBedrockValidationMessage, 'Error reading file.', 'error');
            resetDropArea(javaBedrockDropArea, javaBedrockInputFile, javaBedrockDropAreaText, javaBedrockDefaultDropText);
            javaBedrockFileContent = '';
        };
        reader.readAsText(file);
    }

     if (javaBedrockDropArea && javaBedrockInputFile && javaBedrockDropAreaText) {
        setupDropArea(javaBedrockDropArea, javaBedrockInputFile, javaBedrockDropAreaText, javaBedrockDefaultDropText);
         javaBedrockInputFile.addEventListener('change', () => {
            if (javaBedrockInputFile.files.length > 0) {
                const file = javaBedrockInputFile.files[0];
                 if (file.type === 'text/plain' || file.name.toLowerCase().endsWith('.txt')) {
                    handleJavaBedrockFileRead(file);
                 } else {
                    showValidationMessage(javaBedrockValidationMessage, 'Please select a .txt file.', 'error');
                    resetDropArea(javaBedrockDropArea, javaBedrockInputFile, javaBedrockDropAreaText, javaBedrockDefaultDropText);
                    javaBedrockFileContent = '';
                 }
            } else {
                 javaBedrockFileContent = '';
            }
        });
    }

    if (javaBedrockTranslateButton) {
        javaBedrockTranslateButton.addEventListener('click', async () => {
            if (!javaBedrockFileContent) {
                showValidationMessage(javaBedrockValidationMessage, 'Please select a file with Java commands first.', 'error');
                return;
            }
            hideValidationMessage(javaBedrockValidationMessage);

            const commands = javaBedrockFileContent.split(/\r?\n/).filter(cmd => cmd.trim().length > 0);
            if (commands.length === 0) {
                showValidationMessage(javaBedrockValidationMessage, 'File contains no valid commands.', 'error');
                return;
            }

            try {
                // Show loading state
                javaBedrockTranslateButton.disabled = true;
                javaBedrockTranslateButton.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i>Translating...';
                showValidationMessage(javaBedrockValidationMessage, 'Translating commands...', 'info');

                const response = await fetch('/translate', { // Fetch from the server endpoint
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ commands }),
                });

                hideValidationMessage(javaBedrockValidationMessage); // Clear info message

                if (!response.ok) {
                    let errorMsg = `Translation failed: ${response.statusText} (${response.status})`;
                    try {
                        const errorData = await response.json();
                        errorMsg = errorData.error || errorMsg;
                    } catch (e) { /* Ignore if response not JSON */ }
                    throw new Error(errorMsg);
                }

                const result = await response.json();

                if (!result.translatedCommands || !Array.isArray(result.translatedCommands)) {
                    throw new Error('Invalid response format from server');
                }

                // Display translated commands
                javaBedrockPreviewText.value = result.translatedCommands.join('\n');
                javaBedrockOutputPreview.style.display = 'block';
                javaBedrockDownloadButton.disabled = result.translatedCommands.length === 0;
                 showValidationMessage(javaBedrockValidationMessage, 'Translation completed successfully!', 'success');
                // Optionally display errors from result.errors if the server sends them back

            } catch (error) {
                console.error('Java->Bedrock Translation error:', error);
                 hideValidationMessage(javaBedrockValidationMessage); // Clear info message
                showValidationMessage(javaBedrockValidationMessage, error.message || 'An unexpected error occurred during translation.', 'error');
                javaBedrockOutputPreview.style.display = 'none';
            } finally {
                // Reset button state
                javaBedrockTranslateButton.disabled = false;
                javaBedrockTranslateButton.innerHTML = '<i class="fas fa-exchange-alt me-2"></i>Translate Commands';
            }
        });
    }

    if (javaBedrockDownloadButton) {
        javaBedrockDownloadButton.addEventListener('click', () => {
            const commandsText = javaBedrockPreviewText.value;
            if (!commandsText) {
                showValidationMessage(javaBedrockValidationMessage, 'No translated commands to download.', 'error');
                return;
            }
            const originalFileName = javaBedrockInputFile.files[0]?.name || 'java_commands';
            const baseName = originalFileName.replace(/\.[^/.]+$/, "");
            const fileName = `${baseName}_translated_bedrock.txt`;

            const blob = new Blob([commandsText], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showValidationMessage(javaBedrockValidationMessage, 'Bedrock commands file download started.', 'success');
        });
    }

     // --- Helper to re-attach file input change listeners after reset ---
     // This is needed because replacing innerHTML removes old listeners.
     function attachFileInputChangeListener(inputId) {
         const inputElement = document.getElementById(inputId);
         if (!inputElement) return;

         if (inputId === 'raw-to-nbt-input-file') {
             inputElement.addEventListener('change', () => { /* Re-attach specific logic */ });
         } else if (inputId === 'cmd-struct-input-file') {
            inputElement.addEventListener('change', () => { /* Re-attach specific logic */ });
         } else if (inputId === 'nbt-to-raw-input-file') {
            inputElement.addEventListener('change', () => { /* Re-attach specific logic */ });
         } else if (inputId === 'schem-input-file') {
            inputElement.addEventListener('change', () => { /* Re-attach specific logic */ });
         } else if (inputId === 'java-bedrock-input-file') {
            inputElement.addEventListener('change', () => { /* Re-attach specific logic */ });
         }
         // Add the actual file reading logic back inside these handlers, similar to initial setup
          console.warn(`Re-attaching listener for ${inputId} - Make sure file handling logic is inside!`);

     }

    console.log("Blacklight NBT script initialized.");

}); // End DOMContentLoaded

// --- END OF FILE script.js ---