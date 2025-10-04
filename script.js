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
// Note: These rely on a global 'nbtWriterCurrentOffset' managed during buffer creation.
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
            // This is a bit of a hack for floats, as JS doesn't distinguish float/double well.
            // We write it as a 32-bit float by getting its raw int representation.
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
            nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, TAG_END); // TAG_END as list type for empty list
            nbtWriterCurrentOffset = writeInt(buffer, nbtWriterCurrentOffset, 0); // Length 0
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
                nbtWriterCurrentOffset = writeByte(buffer, nbtWriterCurrentOffset, TAG_END); // End of compound in list
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
    // A rough estimation. Multiply JSON string length by a factor.
    // NBT is often more compact than JSON for numbers, but names/strings add overhead.
    // A factor of 4 is a generous safe bet. Minimum of 10MB for very large structures.
    const jsonSize = JSON.stringify(data).length;
    return Math.max(jsonSize * 4, 10 * 1024 * 1024); // At least 10MB or 4x JSON size
}

function createNbtBuffer(data) {
    try {
        const estimatedSize = estimateNbtBufferSize(data);
        const arrayBuffer = new ArrayBuffer(estimatedSize);
        const buffer = new DataView(arrayBuffer);
        nbtWriterCurrentOffset = 0; // Reset writer offset

        // Root compound tag
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
        // Combine high and low 32-bit integers into a 64-bit BigInt
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

// Global state for Raw to NBT tool
let rawToNbtFileContent = '';

function getUtf8ByteLength(str) {
    const encoder = new TextEncoder();
    return encoder.encode(str).length;
}

function escapeQuotes(command) {
    return command.replace(/"/g, '\\\\\\"');
}

function getUsefulCommands(content) {
    const commands = content.split('\n').map(cmd => cmd.trim()).filter(cmd => cmd.length > 0);
    return commands.map(escapeQuotes);
}

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

function getBlockOpener(nbtName) {
    return `{Block:{name:"minecraft:moving_block",states:{},version:17959425},Count:1b,Damage:0s,Name:"minecraft:moving_block",WasPickedUp:0b,tag:{display:{Lore:["Â§lÂ§bBuild By: Â§dBlacklightî„€","Â§3NBT Tool By: Â§aBrutus314 ","Â§aand Clawsky123î„ ","Â§9Conversion Tool By: ","Â§eExgioan!!î„‚","Â§fSpecial Thanks To:","Â§6Chronicles765!!    î„ƒ","Â§4Warning: Â§cDont Hold Too","Â§cMany Or You Will Lag!!Â§âˆ†"],Name:"Â§lÂ§dBlacklight NBT: Â§gÂ§l${nbtName}"},ench:[{id:28s,lvl:1s}],movingBlock:{name:"minecraft:sea_lantern",states:{},version:17879555},movingEntity:{Occupants:[`;
}

function getBlockCloser() {
    return '],id:"Beehive"}}}';
}

function getNpcOpener(section, nbtName) {
    return `{ActorIdentifier:"minecraft:npc<>",SaveData:{Actions:"[{"button_name" : "Build Part: ${section}","data" : [`;
}

function getNpcCloser(section, nbtName) {
    return `],"mode" : 0,"text" : "","type" : 1}]",CustomName:"Â§lÂ§dBlacklight NBT: ${nbtName}",CustomNameVisible:1b,InterativeText:"Â§cBuild By: Â§dBlacklight!!î„€\nThanks to Kitty_shizz\nBuild Part: ${section}\nÂ§cConversion Tool By: Â§dExgioan!!\nÂ§cSpecial Thanks To: Â§dChronicles765!!! î„ƒ\nÂ§6Thanks For Trying My ${nbtName} Build!!!",Persistent:1b,Pos:[],RawtextName:"Â§lÂ§dBlacklight NBT: ${nbtName}",Tags:["${nbtName}${section}"],Variant:3,definitions:["+minecraft:npc"],identifier:"minecraft:npc"},TicksLeftToStay:0}`;
}

function getEqualsNpcOpener(section, nbtName) {
    return `{ActorIdentifier:"minecraft:npc<>",SaveData:{"Actions":"[{\\"button_name\\" : \\"Build Part: ${section}\\",       \\"data\\" : [`;
}

function getEqualsNpcCloser(section, nbtName) {
    return `],       \\"mode\\" : 0,       \\"text\\" : \\"\\",       \\"type\\" : 1}]",CustomName:"Â§lÂ§dBlacklight NBT: ${nbtName}",CustomNameVisible:1b,InteractiveText:"§cBuild By:"Â§cBuild By: Â§dBlacklight!!î„€\nThanks to Kitty_shizz\nBuild Part: ${section}\nÂ§cConversion Tool By: Â§dExgioan!!\nÂ§cSpecial Thanks To: Â§dChronicles765!!!\n§6Thanks For Trying My ${nbtName} Build!!!",Persistent:1b,Pos:[],RawtextName:"Â§lÂ§dBlacklight NBT: ${nbtName}",Tags:["${nbtName}${section}"],Variant:3,definitions:["+minecraft:npc"],identifier:"minecraft:npc"},TicksLeftToStay:0}`;
}

function commandJoinerNormal(commands) {
    return commands.map(cmd => `{"cmd_line":"${cmd}","cmd_ver":12}`).join(',');
}

function commandJoinerEquals(commands) {
    return commands.map(cmd => `          {             \\"cmd_line\\":\\"${cmd}\\",             \\"cmd_ver\\" : 42          }`).join(',');
}

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
            if (currentCommands.length > 0) {
                const npcCommandList = [...currentCommands];
                if (!isEquals) {
                    npcCommandList.push('/tickingarea add circle ~60 ~20 ~60 4 NPCCOMMANDS');
                } else {
                    npcCommandList.push('/tickingarea add circle ~60 ~20 ~60 4 EQUALSCOMMANDS');
                }
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
            currentSection += 1;
            currentCommands = [cmd];
        }
    }

    if (currentCommands.length > 0) {
        const npcCommandList = [...currentCommands];
        if (!isEquals) {
            npcCommandList.push('/tickingarea add circle ~60 ~20 ~60 4 NPCCOMMANDS');
        } else {
            npcCommandList.push('/tickingarea add circle ~60 ~20 ~60 4 EQUALSCOMMANDS');
        }
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

     // Link NPCs together
     for (let i = 0; i < npcDataList.length - 1; i++) {
        const currentBlockData = npcDataList[i];
        const nextSection = npcDataList[i + 1].section;
        const dialogueOpenCmd = `/dialogue open @e[tag=${nbtName}${nextSection},type=NPC] @initiator`;
        const escapedDialogueCmd = escapeQuotes(dialogueOpenCmd);

        const dialogueOpenCmdFormatted = isEquals
            ? `          {             \\"cmd_line\\":\\"${escapedDialogueCmd}\\",             \\"cmd_ver\\" : 42          }`
            : `{"cmd_line":"${escapedDialogueCmd}","cmd_ver":12}`;

         const killCmdJsonNormal = `{"cmd_line":"${escapeQuotes('/kill @s')}","cmd_ver":12}`;
         const killCmdJsonEquals = `          {             \\"cmd_line\\":\\"${escapeQuotes('/kill @s')}\\",             \\"cmd_ver\\" : 42          }`;
         const killCmdJson = isEquals ? killCmdJsonEquals : killCmdJsonNormal;

         const killIndex = currentBlockData.block.lastIndexOf(killCmdJson);
         if (killIndex !== -1) {
             const commaIndex = currentBlockData.block.lastIndexOf(',', killIndex);
             if (commaIndex !== -1) {
                  npcDataList[i].block = currentBlockData.block.substring(0, commaIndex + 1) + dialogueOpenCmdFormatted + currentBlockData.block.substring(commaIndex);
             } else {
                  console.warn(`RawToNBT: Could not find comma before kill command in section ${currentBlockData.section}.`);
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
             console.warn(`RawToNBT: Could not find kill command for inserting dialogue command in section ${currentBlockData.section}.`);
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

// ========================================================================== //
//                 Commands to Structure Converter Logic                      //
// ========================================================================== //

// Global state for Commands to Structure tool
let cmdStructFileContent = '';
let commandsToStructureData = {
    format_version: 1, size: [0, 0, 0], structure: { block_indices: [[], []], entities: [], palette: { default: { block_palette: [], block_position_data: {} } } }, structure_world_origin: [0, 0, 0]
};
// This map will store {x: {y: {z: {solid: Array, liquid: Array}}}}
let cmdStructBlocksMap = {};

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
    cmdStructBlocksMap = {}; // Reset blocksMap
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
            const isFill = commandName === 'fill' && parts.length >= 8;
            const isSetblock = commandName === 'setblock' && parts.length >= 5;

            if (isFill || isSetblock) {
                let x1, y1, z1, x2, y2, z2, blockStrPartsIndex;
                if (isSetblock) {
                    x1 = baseX + parseCmdStructCoordinate(parts[1]);
                    y1 = baseY + parseCmdStructCoordinate(parts[2]);
                    z1 = baseZ + parseCmdStructCoordinate(parts[3]);
                    x2 = x1; y2 = y1; z2 = z1;
                    blockStrPartsIndex = 4;
                } else { // isFill
                    x1 = baseX + parseCmdStructCoordinate(parts[1]);
                    y1 = baseY + parseCmdStructCoordinate(parts[2]);
                    z1 = baseZ + parseCmdStructCoordinate(parts[3]);
                    x2 = baseX + parseCmdStructCoordinate(parts[4]);
                    y2 = baseY + parseCmdStructCoordinate(parts[5]);
                    z2 = baseZ + parseCmdStructCoordinate(parts[6]);
                    blockStrPartsIndex = 7;
                }

                const blockStr = parts.slice(blockStrPartsIndex).join(' ');
                const [parsedBlockName, states] = parseCmdStructBlockWithStates(blockStr);
                const normalizedBlockName = parsedBlockName.includes(':') ? parsedBlockName : `minecraft:${parsedBlockName}`;

                const startX = Math.min(x1, x2);
                const endX = Math.max(x1, x2);
                const startY = Math.min(y1, y2);
                const endY = Math.max(y1, y2);
                const startZ = Math.min(z1, z2);
                const endZ = Math.max(z1, z2);

                for (let x = startX; x <= endX; x++) {
                    if (!cmdStructBlocksMap[x]) cmdStructBlocksMap[x] = {};
                    for (let y = startY; y <= endY; y++) {
                        if (!cmdStructBlocksMap[x][y]) cmdStructBlocksMap[x][y] = {};
                        for (let z = startZ; z <= endZ; z++) {
                            if (!cmdStructBlocksMap[x][y][z]) cmdStructBlocksMap[x][y][z] = {};

                            const blockDataToStore = [parsedBlockName, isFill ? {...states} : states];

                            if (normalizedBlockName === 'minecraft:water') {
                                cmdStructBlocksMap[x][y][z].liquid = blockDataToStore;
                            } else {
                                cmdStructBlocksMap[x][y][z].solid = blockDataToStore;
                            }
                        }
                    }
                }
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
    return { commandCount, errorCount, blocksFound: Object.keys(cmdStructBlocksMap).length > 0 };
}

function convertToStructureData() {
    try {
        console.log("CmdStruct: Starting conversion to structure data...");
        commandsToStructureData = {
            format_version: 1, size: [0, 0, 0], structure: { block_indices: [[], []], entities: [], palette: { default: { block_palette: [], block_position_data: {} } } }, structure_world_origin: [0, 0, 0]
        };

        const allXCoords = Object.keys(cmdStructBlocksMap).map(Number);
        if (allXCoords.length === 0) {
            return { success: false, message: "No blocks found. Cannot generate structure." };
        }

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;

        for (const xStr in cmdStructBlocksMap) {
            const x = Number(xStr);
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            for (const yStr in cmdStructBlocksMap[xStr]) {
                const y = Number(yStr);
                minY = Math.min(minY, y); maxY = Math.max(maxY, y);
                for (const zStr in cmdStructBlocksMap[xStr][yStr]) {
                    if (Object.keys(cmdStructBlocksMap[xStr][yStr][zStr]).length > 0) {
                        const z = Number(zStr);
                        minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
                    }
                }
            }
        }
        if (minZ === Infinity) {
            return { success: false, message: "No actual block data found after parsing. Cannot generate structure." };
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
        let solidBlockCount = 0;
        let liquidBlockCount = 0;

        const blockIndicesLayer0 = [];
        const blockIndicesLayer1 = [];
        const airIndex = -1;

        // Per user request, using the XYZ loop order from the updated script.
        for (let x_rel = 0; x_rel < width; x_rel++) {
            for (let y_rel = 0; y_rel < height; y_rel++) {
                for (let z_rel = 0; z_rel < depth; z_rel++) {
                    const worldX = minX + x_rel;
                    const worldY = minY + y_rel;
                    const worldZ = minZ + z_rel;

                    const cellData = cmdStructBlocksMap[worldX]?.[worldY]?.[worldZ];
                    let paletteIndexSolid = airIndex;
                    let paletteIndexLiquid = airIndex;

                    // Process Solid Block (Layer 0)
                    if (cellData?.solid) {
                        solidBlockCount++;
                        const [blockName, states] = cellData.solid;
                        let blockIdStr = blockName.includes(':') ? blockName : `minecraft:${blockName}`;
                        const stateEntries = Object.entries(states || {}).sort((a, b) => a[0].localeCompare(b[0]));
                        const blockKey = JSON.stringify([blockIdStr, stateEntries]);

                        if (!uniqueBlocks.has(blockKey)) {
                            paletteIndexSolid = palette.length;
                            uniqueBlocks.set(blockKey, paletteIndexSolid);
                            palette.push({ name: blockIdStr, states: states || {}, version: 18163713 });
                        } else {
                            paletteIndexSolid = uniqueBlocks.get(blockKey);
                        }
                    }
                    blockIndicesLayer0.push(paletteIndexSolid);

                    // Process Liquid Block (Layer 1, e.g., water)
                    if (cellData?.liquid) {
                        liquidBlockCount++;
                        const [blockName, states] = cellData.liquid;
                        let blockIdStr = blockName.includes(':') ? blockName : `minecraft:${blockName}`;
                        const stateEntries = Object.entries(states || {}).sort((a, b) => a[0].localeCompare(b[0]));
                        const blockKey = JSON.stringify([blockIdStr, stateEntries]);

                        if (!uniqueBlocks.has(blockKey)) {
                            paletteIndexLiquid = palette.length;
                            uniqueBlocks.set(blockKey, paletteIndexLiquid);
                            palette.push({ name: blockIdStr, states: states || {}, version: 18163713 });
                        } else {
                            paletteIndexLiquid = uniqueBlocks.get(blockKey);
                        }
                    }
                    blockIndicesLayer1.push(paletteIndexLiquid);
                }
            }
        }

        console.log(`CmdStruct: Found ${solidBlockCount} solid blocks, ${liquidBlockCount} liquid blocks. Created palette with ${palette.length} unique entries.`);
        if (blockIndicesLayer0.length !== totalVolume) {
            console.error(`CmdStruct: CRITICAL INDEXING ERROR (Layer 0): Final block_indices length (${blockIndicesLayer0.length}) does not match calculated volume (${totalVolume}). This structure WILL NOT load correctly.`);
        }
        if (blockIndicesLayer1.length !== totalVolume) {
            console.error(`CmdStruct: CRITICAL INDEXING ERROR (Layer 1): Final block_indices length (${blockIndicesLayer1.length}) does not match calculated volume (${totalVolume}).`);
        }

        commandsToStructureData.size = [width, height, depth];
        commandsToStructureData.structure_world_origin = [minX, minY, minZ];
        commandsToStructureData.structure.block_indices = [blockIndicesLayer0, blockIndicesLayer1];
        commandsToStructureData.structure.palette.default.block_palette = palette;
        commandsToStructureData.structure.entities = [];
        commandsToStructureData.structure.palette.default.block_position_data = {};

        return {
            success: true,
            data: commandsToStructureData,
            dimensions: { width, height, depth },
            origin: [minX, minY, minZ],
            solidBlockCount: solidBlockCount,
            liquidBlockCount: liquidBlockCount,
            paletteCount: palette.length
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

function extractFillSetblockCommandsFromHorionText(fileContent) {
    const allExtractedCommands = [];
    // Regex to find and capture the string content of "Actions:<value>"
    const actionsRegex = /Actions\s*:\s*"((?:\\.|[\s\S])*)"(?=,|\s*\}|\s*\])/g;

    let actionsMatch;
    while ((actionsMatch = actionsRegex.exec(fileContent)) !== null) {
        let actionsStringContentFromFile = actionsMatch[1];

        // First level of unescaping: for the "Actions" string value itself.
        let unescapedActionsString = actionsStringContentFromFile.replace(/\\"/g, '"');
        unescapedActionsString = unescapedActionsString.replace(/\\\\/g, '\\');

        // Regex to find "cmd_line":"<command_value>" within the unescapedActionsString.
        const cmdLineRegexRobust = /"cmd_line"\s*:\s*"((?:\\.|[^"\\])*)"/g;

        let cmdMatch;
        while ((cmdMatch = cmdLineRegexRobust.exec(unescapedActionsString)) !== null) {
            let rawCapturedCmdValue = cmdMatch[1];
            let processedCommand = rawCapturedCmdValue.replace(/\\"/g, '"');
            processedCommand = processedCommand.replace(/\\\\/g, '\\');

            if (processedCommand.startsWith('fill ') || processedCommand.startsWith('setblock ')) {
                allExtractedCommands.push(processedCommand);
            }
        }
    }
    return allExtractedCommands;
}

// ========================================================================== //
//                  SHARED JAVA -> BEDROCK TRANSLATION ENGINE                 //
// ========================================================================== //

function getBaseBlockName(blockId) {
    if (!blockId) return '';
    return blockId.includes(':') ? blockId.split(':')[1] : blockId;
}

function parseJsonStringValue(value) {
    if (typeof value !== 'string') return value;
    try {
        const p = JSON.parse(value);
        return (typeof p === 'string' || typeof p === 'number' || typeof p === 'boolean') ? p : value;
    } catch (e) {
        return value;
    }
}

function parseJavaBlockString(blockStr) {
    const match = blockStr.match(/([\w:]+)(?:\[([^\]]*)\])?/);
    if (!match) return { blockId: blockStr, states: {} };
    const [, blockId, stateString] = match;
    const states = {};
    if (stateString) {
        stateString.split(',').forEach(pair => {
            if (!pair) return;
            const parts = pair.split('=');
            if (parts.length === 2) {
                const key = parts[0].trim();
                let value = parts[1].trim();
                if (value.startsWith('"') && value.endsWith('"')) {
                    value = value.substring(1, value.length - 1);
                }
                states[key] = value;
            }
        });
    }
    return { blockId: blockId.trim(), states };
}

function javaToUniversal(parsedJavaBlock) {
    const baseBlockName = getBaseBlockName(parsedJavaBlock.blockId);
    const rules = window.javaToUniversalMaps[baseBlockName] || [];
    const universalBlock = { name: `universal_minecraft:${baseBlockName}`, properties: {} };

    try {
        // Find new block name first
        for (const rule of rules) {
            if (rule.function === 'new_block') {
                universalBlock.name = rule.options;
                break;
            }
        }
        // Apply other rules
        for (const rule of rules) {
            switch (rule.function) {
                case 'new_properties':
                    Object.assign(universalBlock.properties, rule.options);
                    break;
                case 'carry_properties':
                    for (const propKey in rule.options) {
                        const javaValue = parsedJavaBlock.states[propKey];
                        if (javaValue !== undefined) {
                            const allowedValues = rule.options[propKey];
                            if (Array.isArray(allowedValues)) {
                                const javaValueStr = String(javaValue).toLowerCase();
                                const matchingValue = allowedValues.find(v => String(parseJsonStringValue(v)).toLowerCase() === javaValueStr);
                                if (matchingValue) universalBlock.properties[propKey] = matchingValue;
                            }
                        }
                    }
                    break;
                case 'map_properties':
                    for (const propKey in rule.options) {
                        const javaValue = parsedJavaBlock.states[propKey];
                        if (javaValue !== undefined) {
                            const mappingOptions = rule.options[propKey];
                            const mappingForValue = mappingOptions?.[javaValue] ?? mappingOptions?.[`"${javaValue}"`];
                            if (mappingForValue?.[0]?.function === 'new_properties') {
                                Object.assign(universalBlock.properties, mappingForValue[0].options);
                            }
                        }
                    }
                    break;
            }
        }
    } catch (error) {
        console.error(`Error applying Java->Universal rules for ${baseBlockName}:`, error);
        // Fallback to a direct copy on error
        universalBlock.properties = { ...parsedJavaBlock.states };
    }

    // Special handling for sea pickles
    if (baseBlockName === 'sea_pickle') {
        universalBlock.properties.pickle_is_dead = parsedJavaBlock.states.waterlogged === 'false';
        delete universalBlock.properties.waterlogged;
    }
    return universalBlock;
}

function universalToBedrock(universalBlock) {
    const baseUniversalName = getBaseBlockName(universalBlock.name);
    const rules = window.universalToBedrockMaps[baseUniversalName] || [];
    const bedrockRepresentation = { name: `minecraft:${baseUniversalName}`, states: {} };

    if (!rules.length) {
        // No rules, just copy properties and parse values
        for (const key in universalBlock.properties) {
            bedrockRepresentation.states[key] = parseJsonStringValue(universalBlock.properties[key]);
        }
    } else {
        try {
            const applyNestedRules = (nestedRules, currentBedrockRep, universalProps) => {
                if (!Array.isArray(nestedRules)) return;
                for (const rule of nestedRules) {
                    switch (rule.function) {
                        case 'new_block':
                            currentBedrockRep.name = rule.options;
                            break;
                        case 'new_properties':
                            for (const [key, value] of Object.entries(rule.options)) {
                                currentBedrockRep.states[key] = parseJsonStringValue(value);
                            }
                            break;
                        case 'map_properties':
                            for (const propKey in rule.options) {
                                const universalValue = universalProps[propKey];
                                if (universalValue !== undefined) {
                                    const cleanValue = parseJsonStringValue(universalValue);
                                    let mappingForValue = rule.options[propKey]?.[String(cleanValue)] ?? rule.options[propKey]?.[`"${cleanValue}"`];
                                    if (mappingForValue && Array.isArray(mappingForValue)) {
                                        applyNestedRules(mappingForValue, currentBedrockRep, universalProps);
                                    }
                                }
                            }
                            break;
                        case 'carry_properties':
                            for (const propKey in rule.options) {
                                const universalValue = universalProps[propKey];
                                if (universalValue !== undefined) {
                                    const allowedValues = rule.options[propKey];
                                    if (Array.isArray(allowedValues)) {
                                        const parsedValue = parseJsonStringValue(universalValue);
                                        if (allowedValues.some(allowed => String(parseJsonStringValue(allowed)).toLowerCase() === String(parsedValue).toLowerCase())) {
                                            currentBedrockRep.states[propKey] = parsedValue;
                                        }
                                    }
                                }
                            }
                            break;
                    }
                }
            };
            // Find new block name first
            const newBlockRule = rules.find(rule => rule.function === 'new_block');
            if (newBlockRule) bedrockRepresentation.name = newBlockRule.options;
            // Apply all other rules
            applyNestedRules(rules.filter(rule => rule.function !== 'new_block'), bedrockRepresentation, universalBlock.properties);
        } catch (error) {
            console.error(`Error applying Universal->Bedrock rules for ${baseUniversalName}:`, error);
        }
    }

    // Special handling for sea pickles
    if (universalBlock.properties.hasOwnProperty('pickle_is_dead')) {
        bedrockRepresentation.states.dead_bit = universalBlock.properties.pickle_is_dead === true;
        delete bedrockRepresentation.states.pickle_is_dead;
    }
    return bedrockRepresentation;
}


// ========================================================================== //
//                  Schematic to Commands Converter Logic                     //
// ========================================================================== //

// Global state for Schematic to Commands tool
let schemFileObject = null;

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

function createTranslatedPalette(paletteNbt) {
    const translatedPalette = new Map();
    for (const [javaBlockString, id] of Object.entries(paletteNbt)) {
        const parsedJava = parseJavaBlockString(javaBlockString);
        let isWaterlogged = parsedJava.states.waterlogged === 'true';

        // Sea pickles are not part of the generic water layer; their state is handled differently.
        if (getBaseBlockName(parsedJava.blockId) === 'sea_pickle') {
            isWaterlogged = false;
        }
        // If it's a generic waterlogged block, remove the state before translation.
        if (isWaterlogged) {
            delete parsedJava.states.waterlogged;
        }

        const universal = javaToUniversal(parsedJava);
        const bedrock = universalToBedrock(universal);
        // Store both the translated block AND its waterlogged status
        translatedPalette.set(id, { bedrockBlock: bedrock, isWaterlogged });
    }
    return translatedPalette;
}

function formatBedrockBlockString(bedrockBlock, includeStates) {
    if (!bedrockBlock || !bedrockBlock.name) return 'minecraft:air';
    if (!includeStates || !bedrockBlock.states || Object.keys(bedrockBlock.states).length === 0) {
        return bedrockBlock.name;
    }
    const stateParts = Object.entries(bedrockBlock.states).map(([key, value]) => {
        let valStr;
        if (typeof value === 'boolean') valStr = value.toString();
        else if (typeof value === 'string') valStr = `"${value}"`;
        else valStr = String(value); // For numbers
        return `"${key}"=${valStr}`;
    });
    return `${bedrockBlock.name}[${stateParts.join(',')}]`;
}

function findFillVolume(startX, startY, startZ, context) {
    const { dims, getIndex, getCommandStringForCoord, processedMask } = context;
    const [sizeX, sizeY, sizeZ] = dims;
    const targetCmdString = getCommandStringForCoord(startX, startY, startZ);

    function isMatch(x, y, z) {
        const idx = getIndex(x, y, z);
        if (processedMask[idx] === 1) return false;
        return getCommandStringForCoord(x, y, z) === targetCmdString;
    }

    let x2 = startX;
    while (x2 + 1 < sizeX && isMatch(x2 + 1, startY, startZ)) { x2++; }
    let z2 = startZ;
    let canExpandZ = true;
    while (canExpandZ && z2 + 1 < sizeZ) {
        for (let xCheck = startX; xCheck <= x2; xCheck++) {
            if (!isMatch(xCheck, startY, z2 + 1)) { canExpandZ = false; break; }
        }
        if (canExpandZ) z2++;
    }
    let y2 = startY;
    let canExpandY = true;
    while (canExpandY && y2 + 1 < sizeY) {
        for (let xCheck = startX; xCheck <= x2; xCheck++) {
            for (let zCheck = startZ; zCheck <= z2; zCheck++) {
                if (!isMatch(xCheck, y2 + 1, zCheck)) { canExpandY = false; break; }
            }
            if (!canExpandY) break;
        }
        if (canExpandY) y2++;
    }
    return [x2, y2, z2];
}

function generateSchemCommands(schematicData, dims, offset, includeAir, includeBlockStates, processWaterlogging) {
    const [width, height, length] = dims.map(Math.floor);
    const [dx, dy, dz] = offset.map(Math.floor);

    let blockData, paletteNbt;
    if (schematicData.Palette && schematicData.BlockData) {
        paletteNbt = schematicData.Palette;
        blockData = schematicData.BlockData;
    } else if (schematicData.Blocks?.Data && schematicData.Blocks.Palette) {
        paletteNbt = schematicData.Blocks.Palette;
        blockData = schematicData.Blocks.Data;
    } else throw new Error("Could not find required schematic keys: 'Palette' and 'BlockData'.");

    if (!(blockData instanceof Uint8Array)) blockData = new Uint8Array(blockData);

    console.log("Translating schematic palette to Bedrock...");
    const translatedPalette = createTranslatedPalette(paletteNbt);
    const expectedBlockCount = width * height * length;
    const layeredBlockGrid = new Array(expectedBlockCount);
    const iterator = varIntIterator(blockData);

    for (let i = 0; i < expectedBlockCount; i++) {
        const result = iterator.next();
        if (result.done) throw new Error(`Ran out of block data at index ${i}.`);
        const paletteEntry = translatedPalette.get(result.value);
        if (paletteEntry) {
            layeredBlockGrid[i] = { main: paletteEntry.bedrockBlock, water: paletteEntry.isWaterlogged };
        } else {
            layeredBlockGrid[i] = { main: { name: 'minecraft:air', states: {} }, water: false };
        }
    }

    const commands = [];
    const getIndex = (x, y, z) => (y * length + z) * width + x;

    // --- PASS 1: Main Blocks ---
    console.log("Generating commands for main block layer...");
    let processedMask = new Uint8Array(expectedBlockCount);
    const commandStringCache = new Map();
    const getMainCmdString = (block) => {
        const key = JSON.stringify(block.main);
        if (commandStringCache.has(key)) return commandStringCache.get(key);
        const str = formatBedrockBlockString(block.main, includeBlockStates);
        commandStringCache.set(key, str);
        return str;
    };
    const mainContext = { dims, getIndex, processedMask, getCommandStringForCoord: (x, y, z) => getMainCmdString(layeredBlockGrid[getIndex(x, y, z)]) };

    for (let y = 0; y < height; y++) for (let z = 0; z < length; z++) for (let x = 0; x < width; x++) {
        const index = getIndex(x, y, z);
        if (processedMask[index] === 1) continue;
        const commandBlockString = mainContext.getCommandStringForCoord(x, y, z);
        if (!includeAir && commandBlockString === 'minecraft:air') {
            processedMask[index] = 1;
            continue;
        }

        const [x2, y2, z2] = findFillVolume(x, y, z, mainContext);
        const relX1 = dx + x, relY1 = dy + y, relZ1 = dz + z;
        if (x !== x2 || y !== y2 || z !== z2) {
            const relX2 = dx + x2, relY2 = dy + y2, relZ2 = dz + z2;
            commands.push(`fill ~${relX1} ~${relY1} ~${relZ1} ~${relX2} ~${relY2} ~${relZ2} ${commandBlockString}`);
        } else {
            commands.push(`setblock ~${relX1} ~${relY1} ~${relZ1} ${commandBlockString}`);
        }
        for (let fillY = y; fillY <= y2; fillY++) for (let fillZ = z; fillZ <= z2; fillZ++) for (let fillX = x; fillX <= x2; fillX++) {
            processedMask[getIndex(fillX, fillY, fillZ)] = 1;
        }
    }

    // --- PASS 2: Water Layer ---
    if (processWaterlogging) {
        console.log("Generating commands for water layer...");
        processedMask = new Uint8Array(expectedBlockCount); // New mask for water pass
        const waterContext = { dims, getIndex, processedMask, getCommandStringForCoord: (x, y, z) => layeredBlockGrid[getIndex(x, y, z)].water ? 'minecraft:water' : 'not_water' };

        for (let y = 0; y < height; y++) for (let z = 0; z < length; z++) for (let x = 0; x < width; x++) {
            const index = getIndex(x, y, z);
            if (processedMask[index] === 1) continue;
            if (layeredBlockGrid[index].water) {
                const [x2, y2, z2] = findFillVolume(x, y, z, waterContext);
                const relX1 = dx + x, relY1 = dy + y, relZ1 = dz + z;
                if (x !== x2 || y !== y2 || z !== z2) {
                    const relX2 = dx + x2, relY2 = dy + y2, relZ2 = dz + z2;
                    commands.push(`fill ~${relX1} ~${relY1} ~${relZ1} ~${relX2} ~${relY2} ~${relZ2} minecraft:water`);
                } else {
                    commands.push(`setblock ~${relX1} ~${relY1} ~${relZ1} minecraft:water`);
                }
                for (let fillY = y; fillY <= y2; fillY++) for (let fillZ = z; fillZ <= z2; fillZ++) for (let fillX = x; fillX <= x2; fillX++) {
                    processedMask[getIndex(fillX, fillY, fillZ)] = 1;
                }
            } else {
                processedMask[index] = 1; // Mark non-water blocks as processed for this pass
            }
        }
    }

    console.log(`Generated ${commands.length} optimized commands.`);
    return { commands, processedBlockCount: expectedBlockCount };
}

// ========================================================================== //
//                MCStructure to Commands Converter Logic (UPDATED)           //
// ========================================================================== //

// --- Global Configuration (will be set by GUI) ---
let mcStructure_GUI_X_OFFSET = 0;
let mcStructure_GUI_Y_OFFSET = 0;
let mcStructure_GUI_Z_OFFSET = 0;
let mcStructure_GUI_BLOCKS_TO_IGNORE = ["minecraft:air", "minecraft:structure_block", "minecraft:structure_void"];
let mcStructure_GUI_KEEP_WATERLOG = false;
const mcStructure_PLACE_AIR_IN_WATERLOG_LAYER_CONST = false; 
let mcStructure_GUI_INCLUDE_BLOCK_STATES = true;
let mcStructure_selectedFile = null;

// --- NBT Parsing Implementation (Adapted for Browser's ArrayBuffer and DataView) ---
function parseNbtForMcStructure(arrayBuffer) {
    const dataView = new DataView(arrayBuffer);
    let offset = 0;
    const textDecoder = new TextDecoder('utf-8');

    function readTagType() {
        if (offset >= dataView.byteLength) throw new Error("NBT Parsing Error: Unexpected end of buffer while reading tag type.");
        const type = dataView.getUint8(offset);
        offset += 1;
        return type;
    }

    function readTagName() {
        if (offset + 2 > dataView.byteLength) throw new Error("NBT Parsing Error: Unexpected end of buffer while reading tag name length.");
        const length = dataView.getUint16(offset, true); // true for little-endian
        offset += 2;
        if (offset + length > dataView.byteLength) throw new Error(`NBT Parsing Error: Tag name length ${length} exceeds buffer bounds.`);
        const value = textDecoder.decode(new Uint8Array(arrayBuffer, offset, length));
        offset += length;
        return value;
    }

    function readTagPayload(tagType) {
        switch (tagType) {
            case TAG_END:
                return null;
            case TAG_BYTE:
                if (offset >= dataView.byteLength) throw new Error("NBT Parsing Error: Unexpected end of buffer while reading TAG_BYTE.");
                const byteVal = dataView.getInt8(offset);
                offset += 1;
                return { type: TAG_BYTE, value: byteVal };
            case TAG_SHORT:
                if (offset + 2 > dataView.byteLength) throw new Error("NBT Parsing Error: Unexpected end of buffer while reading TAG_SHORT.");
                const shortVal = dataView.getInt16(offset, true);
                offset += 2;
                return { type: TAG_SHORT, value: shortVal };
            case TAG_INT:
                if (offset + 4 > dataView.byteLength) throw new Error("NBT Parsing Error: Unexpected end of buffer while reading TAG_INT.");
                const intVal = dataView.getInt32(offset, true);
                offset += 4;
                return { type: TAG_INT, value: intVal };
            case TAG_LONG:
                if (offset + 8 > dataView.byteLength) throw new Error("NBT Parsing Error: Unexpected end of buffer while reading TAG_LONG.");
                const longVal = dataView.getBigInt64(offset, true);
                offset += 8;
                return { type: TAG_LONG, value: longVal };
            case TAG_FLOAT:
                if (offset + 4 > dataView.byteLength) throw new Error("NBT Parsing Error: Unexpected end of buffer while reading TAG_FLOAT.");
                const floatVal = dataView.getFloat32(offset, true);
                offset += 4;
                return { type: TAG_FLOAT, value: floatVal };
            case TAG_DOUBLE:
                if (offset + 8 > dataView.byteLength) throw new Error("NBT Parsing Error: Unexpected end of buffer while reading TAG_DOUBLE.");
                const doubleVal = dataView.getFloat64(offset, true);
                offset += 8;
                return { type: TAG_DOUBLE, value: doubleVal };
            case TAG_BYTE_ARRAY:
                if (offset + 4 > dataView.byteLength) throw new Error("NBT Parsing Error: Unexpected end of buffer while reading TAG_BYTE_ARRAY length.");
                const byteArrayLength = dataView.getInt32(offset, true);
                offset += 4;
                if (offset + byteArrayLength > dataView.byteLength) throw new Error(`NBT Parsing Error: Byte Array length ${byteArrayLength} exceeds buffer bounds.`);
                const byteArray = [];
                for (let i = 0; i < byteArrayLength; i++) {
                    byteArray.push(dataView.getInt8(offset + i));
                }
                offset += byteArrayLength;
                return { type: TAG_BYTE_ARRAY, value: byteArray };
            case TAG_STRING:
                if (offset + 2 > dataView.byteLength) throw new Error("NBT Parsing Error: Unexpected end of buffer while reading TAG_STRING length.");
                const length = dataView.getUint16(offset, true);
                offset += 2;
                if (offset + length > dataView.byteLength) throw new Error(`NBT Parsing Error: String length ${length} exceeds buffer bounds.`);
                const strValue = textDecoder.decode(new Uint8Array(arrayBuffer, offset, length));
                offset += length;
                return { type: TAG_STRING, value: strValue };
            case TAG_LIST:
                if (offset + 5 > dataView.byteLength) throw new Error("NBT Parsing Error: Unexpected end of buffer while reading TAG_LIST header.");
                const listTagType = dataView.getUint8(offset);
                offset += 1;
                const listLength = dataView.getInt32(offset, true);
                offset += 4;
                const list = [];
                for (let i = 0; i < listLength; i++) {
                    if (offset >= dataView.byteLength && i < listLength) {
                        throw new Error(`NBT Parsing Error: Unexpected end of buffer inside TAG_LIST (index ${i}/${listLength}, type ${listTagType}).`);
                    }
                    list.push(readTagPayload(listTagType));
                }
                return { type: TAG_LIST, value: list, listType: listTagType };
            case TAG_COMPOUND:
                const compound = {};
                while (true) {
                    const tagTypeInCompound = readTagType();
                    if (tagTypeInCompound === TAG_END) {
                        break;
                    }
                    const tagName = readTagName();
                    if (offset >= dataView.byteLength && tagTypeInCompound !== TAG_END) {
                        throw new Error(`NBT Parsing Error: Unexpected end of buffer before reading payload for tag "${tagName}" (type ${tagTypeInCompound}) in TAG_COMPOUND.`);
                    }
                    compound[tagName] = readTagPayload(tagTypeInCompound);
                }
                return { type: TAG_COMPOUND, value: compound };
            case TAG_INT_ARRAY:
                if (offset + 4 > dataView.byteLength) throw new Error("NBT Parsing Error: Unexpected end of buffer while reading TAG_INT_ARRAY length.");
                const intArrayLength = dataView.getInt32(offset, true);
                offset += 4;
                if (offset + intArrayLength * 4 > dataView.byteLength) throw new Error(`NBT Parsing Error: Int Array length ${intArrayLength} exceeds buffer bounds.`);
                const intArray = [];
                for (let i = 0; i < intArrayLength; i++) {
                    intArray.push(dataView.getInt32(offset + i * 4, true));
                }
                offset += intArrayLength * 4;
                return { type: TAG_INT_ARRAY, value: intArray };
            case TAG_LONG_ARRAY:
                if (offset + 4 > dataView.byteLength) throw new Error("NBT Parsing Error: Unexpected end of buffer while reading TAG_LONG_ARRAY length.");
                const longArrayLength = dataView.getInt32(offset, true);
                offset += 4;
                if (offset + longArrayLength * 8 > dataView.byteLength) throw new Error(`NBT Parsing Error: Long Array length ${longArrayLength} exceeds buffer bounds.`);
                const longArray = [];
                for (let i = 0; i < longArrayLength; i++) {
                    longArray.push(dataView.getBigInt64(offset + i * 8, true));
                }
                offset += longArrayLength * 8;
                return { type: TAG_LONG_ARRAY, value: longArray };
            default:
                throw new Error(`NBT Parsing Error: Unknown tag type: ${tagType} at offset ${offset - 1}`);
        }
    }

    const rootType = readTagType();
    if (rootType !== TAG_COMPOUND) {
        if (rootType === TAG_END && offset === 1 && dataView.byteLength <= 1) {
            console.warn("Read TAG_END at the beginning. Assuming empty NBT structure.");
            return { '': { type: TAG_COMPOUND, value: {} } };
        }
        throw new Error(`NBT Parsing Error: Expected root tag type TAG_COMPOUND (10), got ${rootType}`);
    }
    const rootName = readTagName();
    const rootCompoundTag = readTagPayload(TAG_COMPOUND);

    return { [rootName]: rootCompoundTag };
}

// --- Helper Function for Deep Object Copy (Handles BigInt) ---
function deepCopyForMcStructure(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (obj instanceof Date) {
        return new Date(obj.getTime());
    }
    if (Array.isArray(obj)) {
        const copiedArr = [];
        for (let i = 0; i < obj.length; i++) {
            copiedArr[i] = deepCopyForMcStructure(obj[i]);
        }
        return copiedArr;
    }
    const copiedObj = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            if (typeof obj[key] === 'bigint') {
                copiedObj[key] = obj[key];
            } else {
                copiedObj[key] = deepCopyForMcStructure(obj[key]);
            }
        }
    }
    return copiedObj;
}

// --- Structure Processing Class (Updated for Waterlogging) ---
class ProcessStructureMcStructure {
    constructor(nbtArrayBuffer) { // Takes ArrayBuffer directly
        let parsedNbtRoot = parseNbtForMcStructure(nbtArrayBuffer);
        let rootCompoundTag = null;
        const rootKeys = Object.keys(parsedNbtRoot);

        if (rootKeys.length === 1) {
            rootCompoundTag = parsedNbtRoot[rootKeys[0]];
            console.log(`Using NBT root with key '${rootKeys[0]}'.`);
        } else if ("" in parsedNbtRoot && parsedNbtRoot[""].type === TAG_COMPOUND) {
            console.log("Using NBT root with empty key ''.");
            rootCompoundTag = parsedNbtRoot[""];
        } else if (rootKeys.length > 1) {
            console.warn("NBT Warning: Root contains multiple keys. Attempting to find a primary compound.");
            for (const key of rootKeys) {
                const potentialTag = parsedNbtRoot[key];
                if (potentialTag && potentialTag.type === TAG_COMPOUND && Object.keys(potentialTag.value).length > 0) {
                    console.log(`Using NBT root with key '${key}'.`);
                    rootCompoundTag = potentialTag;
                    break;
                }
            }
            if (!rootCompoundTag && "" in parsedNbtRoot) {
                rootCompoundTag = parsedNbtRoot[""];
            }
        }

        if (!rootCompoundTag || rootCompoundTag.type !== TAG_COMPOUND || !rootCompoundTag.value) {
            throw new Error(`Could not determine the main root compound or it's invalid. Found keys: ${rootKeys.join(', ')}`);
        }
        this.NBTData = rootCompoundTag.value;

        const requiredKeys = ["size", "structure_world_origin", "structure"];
        for (const key of requiredKeys) {
            if (!(key in this.NBTData) || !this.NBTData[key] || typeof this.NBTData[key].type === 'undefined') {
                throw new Error(`NBT data is missing or has invalid required key: '${key}'.`);
            }
        }

        const sizeTag = this.NBTData.size;
        if (!sizeTag || sizeTag.type !== TAG_LIST || sizeTag.listType !== TAG_INT || sizeTag.value?.length !== 3) {
            throw new Error(`NBT 'size' key is not a valid List<Int>[3].`);
        }
        this.size = sizeTag.value.map(intTag => intTag.value);
        if (this.size.some(isNaN) || this.size.some(s => s <= 0 || !Number.isInteger(s))) {
            throw new Error(`Invalid structure size: [${this.size.join(', ')}]. Dimensions must be positive integers.`);
        }

        const originTag = this.NBTData.structure_world_origin;
        if (!originTag || originTag.type !== TAG_LIST || originTag.listType !== TAG_INT || originTag.value?.length !== 3) {
            throw new Error(`NBT 'structure_world_origin' key is not a valid List<Int>[3].`);
        }
        this.mins = originTag.value.map(intTag => intTag.value);
        if (this.mins.some(isNaN)) throw new Error(`NBT 'structure_world_origin' contains non-numeric values.`);
        this.origin = [...this.mins];

        this.maxs = [
            this.mins[0] + this.size[0] - 1,
            this.mins[1] + this.size[1] - 1,
            this.mins[2] + this.size[2] - 1,
        ];

        const structureTag = this.NBTData.structure;
        if (!structureTag || structureTag.type !== TAG_COMPOUND || !structureTag.value) {
            throw new Error(`NBT 'structure' key is not a valid Compound tag.`);
        }
        const structureData = structureTag.value;

        const paletteTag = structureData.palette;
        if (!paletteTag || paletteTag.type !== TAG_COMPOUND || !paletteTag.value) {
            throw new Error(`NBT 'structure.palette' key is not a valid Compound tag.`);
        }
        const paletteContainer = paletteTag.value;
        const blockPaletteListTag = paletteContainer.default?.value?.block_palette; // Bedrock edition style
        if (!blockPaletteListTag || blockPaletteListTag.type !== TAG_LIST || blockPaletteListTag.listType !== TAG_COMPOUND) {
            throw new Error(`Unsupported palette format. Expected 'structure.palette.default.block_palette' as List<Compound>.`);
        }
        this.rawPaletteTags = blockPaletteListTag.value;

        const blockIndicesListTag = structureData.block_indices;
        if (!blockIndicesListTag || blockIndicesListTag.type !== TAG_LIST || blockIndicesListTag.value?.length === 0) {
            throw new Error(`NBT 'structure.block_indices' is not a valid non-empty List.`);
        }

        const mainIndicesListTag = blockIndicesListTag.value[0];
        if (!mainIndicesListTag || mainIndicesListTag.type !== TAG_LIST || mainIndicesListTag.listType !== TAG_INT) {
            throw new Error(`NBT 'structure.block_indices[0]' is not a valid List<Int>.`);
        }
        this.rawBlockIndicesLayer0 = mainIndicesListTag.value.map(intTag => intTag.value);
        if (this.rawBlockIndicesLayer0.some(isNaN)) {
            this.rawBlockIndicesLayer0 = this.rawBlockIndicesLayer0.map(k => isNaN(k) ? 0 : k); // Default to 0 (air) if NaN
        }

        this.rawBlockIndicesLayer1 = null;
        if (blockIndicesListTag.value.length > 1) {
            const secondaryIndicesListTag = blockIndicesListTag.value[1];
            if (secondaryIndicesListTag && secondaryIndicesListTag.type === TAG_LIST && secondaryIndicesListTag.listType === TAG_INT) {
                this.rawBlockIndicesLayer1 = secondaryIndicesListTag.value.map(intTag => intTag.value);
                 if (this.rawBlockIndicesLayer1.some(isNaN)) {
                    this.rawBlockIndicesLayer1 = this.rawBlockIndicesLayer1.map(k => isNaN(k) ? 0 : k);
                }
                const expectedLength = this.size[0] * this.size[1] * this.size[2];
                if (this.rawBlockIndicesLayer1.length !== expectedLength) {
                     console.warn(`Warning: Block data length for layer 1 (${this.rawBlockIndicesLayer1.length}) does not match structure size (${expectedLength}). It might be padded or truncated.`);
                }
            } else {
                console.log("No valid secondary block layer (layer 1) found in block_indices.");
            }
        } else {
            console.log("Structure has only one block layer. Waterlog layer processing will be skipped if attempted.");
        }

        const expectedLength = this.size[0] * this.size[1] * this.size[2];
        if (this.rawBlockIndicesLayer0.length !== expectedLength) {
            // Some tools might export with padding, try to be lenient for layer 0 if it's just padding
            if (this.rawBlockIndicesLayer0.length > expectedLength) {
                console.warn(`Block data length for layer 0 (${this.rawBlockIndicesLayer0.length}) is greater than structure size (${expectedLength}). Truncating.`);
                this.rawBlockIndicesLayer0 = this.rawBlockIndicesLayer0.slice(0, expectedLength);
            } else {
                throw new Error(`Block data length for layer 0 (${this.rawBlockIndicesLayer0.length}) does not match structure size (${expectedLength}).`);
            }
        }
        this.getBlockmap();
    }

    getIndex(x, y, z) {
        const [sx, sy, sz] = this.size;
        if (x < 0 || x >= sx || y < 0 || y >= sy || z < 0 || z >= sz) {
            throw new RangeError(`Coordinates (${x},${y},${z}) out of bounds for size (${sx},${sy},${sz})`);
        }
        return x * sy * sz + y * sz + z; // X-ZY order
    }

    getBlockmap() {
        this.palette = [{ name: "minecraft:air", states: {} }]; // Add minecraft:air at index 0
        let index_of_air_in_raw_palette = -1;

        for (let i = 0; i < this.rawPaletteTags.length; i++) {
            const blockEntryTag = this.rawPaletteTags[i];
            if (blockEntryTag.type !== TAG_COMPOUND || !blockEntryTag.value) {
                console.warn(`Invalid palette entry at index ${i}, defaulting to air.`);
                this.palette.push({ name: "minecraft:air", states: {} });
                continue;
            }
            const entryData = blockEntryTag.value;
            const nameTag = entryData.name;
            const statesTag = entryData.states;

            const blockName = (nameTag?.type === TAG_STRING) ? nameTag.value : 'minecraft:air';
            let blockStates = {};
            if (statesTag?.type === TAG_COMPOUND && statesTag.value) {
                blockStates = statesTag.value;
            }
            const processedEntry = { name: blockName, states: blockStates };
            if (entryData.version?.type === TAG_INT) {
                processedEntry.version = entryData.version.value;
            }
            this.palette.push(processedEntry);

            if (blockName === "minecraft:air" && index_of_air_in_raw_palette === -1) {
                index_of_air_in_raw_palette = i; // Store original index of air
            }
        }
        
        const mapRawIndicesToCube = (rawIndices, layerName) => {
            if (!rawIndices) return null;
            const cube = new Int32Array(this.size[0] * this.size[1] * this.size[2]);
            const maxIndex = Math.min(rawIndices.length, cube.length); // Handle potential length mismatches

            for (let i = 0; i < maxIndex; i++) {
                const originalRawIndex = rawIndices[i];
                if (originalRawIndex < 0) { // Handles -1 from Bedrock's layer 1 for "no override"
                    cube[i] = 0; // Map to our palette's air (index 0)
                    if (layerName === "Layer 1 (Waterlog)" && originalRawIndex !== -1) {
                        console.warn(`Warning (${layerName}): Found negative block index ${originalRawIndex} at flat index ${i}. Mapping to air (palette index 0).`);
                    } else if (layerName !== "Layer 1 (Waterlog)" && originalRawIndex < 0) {
                         console.warn(`Warning (${layerName}): Found negative block index ${originalRawIndex} at flat index ${i}. Mapping to air (palette index 0).`);
                    }
                    continue;
                }
                if (index_of_air_in_raw_palette !== -1 && originalRawIndex === index_of_air_in_raw_palette) {
                    cube[i] = 0; // Map to our palette's air (index 0)
                } else {
                    // The raw index maps to an index in this.rawPaletteTags.
                    // We added an air block at the start of this.palette, so +1.
                    const targetPaletteIndex = originalRawIndex + 1;
                    if (targetPaletteIndex >= this.palette.length) {
                        console.warn(`Warning (${layerName}): Raw index ${originalRawIndex} maps to palette index ${targetPaletteIndex} (Out of Bounds for current palette size ${this.palette.length}). Mapping to air (palette index 0).`);
                        cube[i] = 0;
                    } else {
                        cube[i] = targetPaletteIndex;
                    }
                }
            }
             if (rawIndices.length > cube.length) {
                console.warn(`(${layerName}): Raw indices array (${rawIndices.length}) was longer than cube size (${cube.length}). Extra indices ignored.`);
            } else if (rawIndices.length < cube.length) {
                console.warn(`(${layerName}): Raw indices array (${rawIndices.length}) was shorter than cube size (${cube.length}). Remaining cube elements will be 0 (air).`);
            }
            return cube;
        };

        this.cubeLayer0 = mapRawIndicesToCube(this.rawBlockIndicesLayer0, "Layer 0 (Main)");
        if (this.rawBlockIndicesLayer1) {
            this.cubeLayer1 = mapRawIndicesToCube(this.rawBlockIndicesLayer1, "Layer 1 (Waterlog)");
        } else {
            this.cubeLayer1 = null;
        }
    }


    get_block(x, y, z, layerIndex = 0) {
        if (x < 0 || x >= this.size[0] || y < 0 || y >= this.size[1] || z < 0 || z >= this.size[2]) {
            throw new RangeError(`Coordinates (${x},${y},${z}) out of bounds for size (${this.size.join(',')})`);
        }
        const cube = (layerIndex === 1 && this.cubeLayer1) ? this.cubeLayer1 : this.cubeLayer0;
        if (!cube) {
            return deepCopyForMcStructure(this.palette[0]); // Return air if layer doesn't exist
        }
        const flatIndex = this.getIndex(x, y, z);
        if (flatIndex >= cube.length) { // Should not happen if getIndex is correct and cube is sized right
             console.warn(`get_block: flatIndex ${flatIndex} out of bounds for cube length ${cube.length}. Coords (${x},${y},${z}), Layer ${layerIndex}. Returning air.`);
             return deepCopyForMcStructure(this.palette[0]);
        }
        const paletteIndex = cube[flatIndex];
        if (paletteIndex >= 0 && paletteIndex < this.palette.length) {
            try {
                return deepCopyForMcStructure(this.palette[paletteIndex]);
            } catch (e) {
                 console.error(`Error deep copying palette entry at index ${paletteIndex}:`, this.palette[paletteIndex], e);
                 return deepCopyForMcStructure(this.palette[0]); // Default to air on error
            }
        } else {
            console.warn(`get_block: Invalid paletteIndex ${paletteIndex} at flatIndex ${flatIndex}. Coords (${x},${y},${z}), Layer ${layerIndex}. Returning air.`);
            return deepCopyForMcStructure(this.palette[0]); // Default to air
        }
    }

    _get_block_unchecked(x, y, z, layerIndex = 0) { // Used by findFillVolume, needs to be fast
        const cube = (layerIndex === 1 && this.cubeLayer1) ? this.cubeLayer1 : this.cubeLayer0;
        if (!cube) {
             return this.palette[0]; // Return direct reference to air
        }
        // No range check on x,y,z here, assume valid from caller
        const flatIndex = x * this.size[1] * this.size[2] + y * this.size[2] + z;

        // Basic check even for unchecked, to prevent crashes if logic is flawed upstream
        if (flatIndex >= cube.length) return this.palette[0];

        const paletteIndex = cube[flatIndex];
        // paletteIndex can be 0 (air), or up to palette.length-1
        if (paletteIndex >= 0 && paletteIndex < this.palette.length) {
            return this.palette[paletteIndex]; // Return direct reference
        }
        return this.palette[0]; // Default to air if paletteIndex is somehow invalid
    }


    getSize() {
        return [...this.size];
    }
}

function formatBlockStatesForMcStructure(statesDict) {
    if (!mcStructure_GUI_INCLUDE_BLOCK_STATES) return '';
    if (!statesDict || typeof statesDict !== 'object' || Array.isArray(statesDict) || Object.keys(statesDict).length === 0) {
        return '';
    }
    const stateParts = [];
    const sortedKeys = Object.keys(statesDict).sort();

    for (const key of sortedKeys) {
        if (!Object.prototype.hasOwnProperty.call(statesDict, key)) continue;
        const stateInfo = statesDict[key];
        let stateValueStr = '';

        if (!stateInfo || typeof stateInfo.type === 'undefined' || typeof stateInfo.value === 'undefined') {
            console.warn(`State key "${key}" has unexpected format:`, stateInfo, `- Skipping state.`);
            continue;
        }
        const nbtType = stateInfo.type;
        const value = stateInfo.value;

        if (nbtType === TAG_BYTE) { // Booleans are often bytes (0 or 1)
            stateValueStr = (value === 0) ? 'false' : ((value === 1) ? 'true' : String(value));
        } else if (nbtType === TAG_SHORT || nbtType === TAG_INT || nbtType === TAG_FLOAT || nbtType === TAG_DOUBLE) {
            stateValueStr = String(value);
        } else if (nbtType === TAG_LONG) {
            stateValueStr = value.toString(); // BigInt to string
        } else if (nbtType === TAG_STRING) {
            stateValueStr = JSON.stringify(String(value)); // Ensure proper quoting for string values
        } else {
            console.warn(`Unsupported NBT type (${nbtType}) in block state for key "${key}". Value:`, value, `Skipping.`);
            continue;
        }
        
        const formattedKey = `"${key.replace(/"/g, '\\"')}"`; // Escape any existing quotes within the key name itself

        stateParts.push(`${formattedKey}=${stateValueStr}`);
    }
    return stateParts.length > 0 ? `[${stateParts.join(',')}]` : '';
}


function findFillVolumeForMcStructure(startX, startY, startZ, processor, processedMask, layerIndex = 0) {
    const [sizeX, sizeY, sizeZ] = processor.getSize();
    const targetBlockData = processor._get_block_unchecked(startX, startY, startZ, layerIndex); // Use unchecked for speed

    if (!targetBlockData) { 
        return [startX, startY, startZ];
    }
    const targetBlockString = `${targetBlockData.name}${formatBlockStatesForMcStructure(targetBlockData.states)}`;

    function isMatch(x, y, z) {
        const idx = processor.getIndex(x,y,z); // Recalculate index for safety
        if (idx >= processedMask.length || processedMask[idx] === 1) return false;

        const currentBlockData = processor._get_block_unchecked(x, y, z, layerIndex);
        if (!currentBlockData) return false;
        const currentBlockString = `${currentBlockData.name}${formatBlockStatesForMcStructure(currentBlockData.states)}`;
        return currentBlockString === targetBlockString;
    }

    let x2 = startX;
    while (x2 + 1 < sizeX && isMatch(x2 + 1, startY, startZ)) {
        x2 += 1;
    }

    let z2 = startZ;
    let canExpandZ = true;
    while (canExpandZ && z2 + 1 < sizeZ) {
        for (let xCheck = startX; xCheck <= x2; xCheck++) {
            if (!isMatch(xCheck, startY, z2 + 1)) {
                canExpandZ = false;
                break;
            }
        }
        if (canExpandZ) z2 += 1;
    }

    let y2 = startY;
    let canExpandY = true;
    while (canExpandY && y2 + 1 < sizeY) {
        for (let xCheck = startX; xCheck <= x2; xCheck++) {
            for (let zCheck = startZ; zCheck <= z2; zCheck++) {
                if (!isMatch(xCheck, y2 + 1, zCheck)) {
                    canExpandY = false;
                    break;
                }
            }
            if (!canExpandY) break;
        }
        if (canExpandY) y2 += 1;
    }
    return [x2, y2, z2];
}

function generateCommandsForLayerMcStructure(layerIndex, processor, processedMask, xOffset, yOffset, zOffset, options) {
    const { ignoreListEffective, layerName } = options;
    console.log(`--- Generating commands for ${layerName} (Layer ${layerIndex}) ---`);
    console.log(`Effective ignore list for this layer: [${ignoreListEffective.join(', ')}]`);

    const [sizeX, sizeY, sizeZ] = processor.getSize();
    const commands = [];
    let fillCount = 0;
    let setblockCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const totalBlocksInLayer = sizeX * sizeY * sizeZ;

    for (let y = 0; y < sizeY; y++) {
        for (let x = 0; x < sizeX; x++) {
            for (let z = 0; z < sizeZ; z++) {
                let currentFlatIndex = -1;
                try {
                    currentFlatIndex = processor.getIndex(x, y, z);
                     if (currentFlatIndex >= processedMask.length || processedMask[currentFlatIndex] === 1) {
                        continue;
                    }
                } catch (rangeError) {
                    console.error(`(${layerName}) Error calculating index for (${x},${y},${z}): ${rangeError.message}. Skipping.`);
                    errorCount++;
                    continue;
                }

                try {
                    const blockData = processor.get_block(x, y, z, layerIndex); // Use get_block for safety & deep copy
                    const blockName = blockData.name || "minecraft:air";

                    if (ignoreListEffective.includes(blockName)) {
                        processedMask[currentFlatIndex] = 1;
                        skippedCount += 1;
                        continue;
                    }

                    const [x2, y2, z2] = findFillVolumeForMcStructure(x, y, z, processor, processedMask, layerIndex);

                    const relX1 = xOffset + x, relY1 = yOffset + y, relZ1 = zOffset + z;
                    const relX2 = xOffset + x2, relY2 = yOffset + y2, relZ2 = zOffset + z2;

                    const blockStatesStr = formatBlockStatesForMcStructure(blockData.states);
                    const fullBlockStr = `${blockName}${blockStatesStr}`;

                    const x1Str = `~${relX1}`, y1Str = `~${relY1}`, z1Str = `~${relZ1}`;

                    if (x !== x2 || y !== y2 || z !== z2) { // It's a fill volume
                        const x2Str = `~${relX2}`, y2Str = `~${relY2}`, z2Str = `~${relZ2}`;
                        commands.push(`fill ${x1Str} ${y1Str} ${z1Str} ${x2Str} ${y2Str} ${z2Str} ${fullBlockStr}`);
                        fillCount++;
                        // Mark all blocks in this fill volume as processed
                        for (let fillX = x; fillX <= x2; fillX++) {
                            for (let fillY = y; fillY <= y2; fillY++) {
                                for (let fillZ = z; fillZ <= z2; fillZ++) {
                                   try {
                                        const fillIndex = processor.getIndex(fillX, fillY, fillZ);
                                        if(fillIndex < processedMask.length) processedMask[fillIndex] = 1;
                                    } catch(e) { /* ignore range error in fill mask, should be caught by outer loops */ }
                                }
                            }
                        }
                    } else { // Single block
                        commands.push(`setblock ${x1Str} ${y1Str} ${z1Str} ${fullBlockStr}`);
                        setblockCount++;
                        processedMask[currentFlatIndex] = 1;
                    }
                } catch (e) {
                    errorCount++;
                    console.error(`(${layerName}) Error processing at (${x},${y},${z}): ${e.message}. Stack: ${e.stack ? e.stack : '(no stack)'}`);
                     if (currentFlatIndex !== -1 && currentFlatIndex < processedMask.length && processedMask[currentFlatIndex] === 0) {
                       processedMask[currentFlatIndex] = 1; // Mark as processed to avoid re-processing an error
                    }
                }
            }
        }
    }
    console.log(`--- ${layerName} (Layer ${layerIndex}) Summary ---`);
    console.log(`Total blocks considered in layer: ${totalBlocksInLayer}`);
    console.log(`Skipped ${skippedCount} ignored blocks.`);
    if (errorCount > 0) console.log(`Encountered errors for ${errorCount} blocks.`);
    console.log(`Generated ${fillCount} /fill and ${setblockCount} /setblock commands.`);
    let processedMaskCount = 0;
    for(let i=0; i < processedMask.length; i++) if (processedMask[i] === 1) processedMaskCount++;

    if (processedMaskCount !== totalBlocksInLayer) {
        console.warn(`(${layerName}) Warning: Mask count (${processedMaskCount}) != total blocks (${totalBlocksInLayer}). ${totalBlocksInLayer - processedMaskCount} unmasked.`);
    } else {
        console.log(`(${layerName}) Sanity check: All positions accounted for in mask.`);
    }
    return commands;
}

function structureToRelativeSetblocksMcStructure(nbtArrayBuffer) { // Takes ArrayBuffer
    console.log(`Processing structure from supplied NBT data.`);
    let structProcessor;
    try {
        structProcessor = new ProcessStructureMcStructure(nbtArrayBuffer);
    } catch (e) {
        console.error(`Error loading/processing structure: ${e.message}\n${e.stack ? e.stack : '(no stack)'}`);
        throw e; // Re-throw to be caught by main handler
    }

    const size = structProcessor.getSize();
    const [sizeX, sizeY, sizeZ] = size;

    if (sizeX <= 0 || sizeY <= 0 || sizeZ <= 0) {
        console.log(`Invalid structure size: [${size.join(', ')}]. Aborting.`);
        return [];
    }
    console.log(`Structure dimensions (X,Y,Z): [${size.join(', ')}], Origin: [${structProcessor.mins.join(', ')}]`);
    console.log(`Offset (X,Y,Z): [${mcStructure_GUI_X_OFFSET}, ${mcStructure_GUI_Y_OFFSET}, ${mcStructure_GUI_Z_OFFSET}]`);

    const totalBlocks = sizeX * sizeY * sizeZ;
    let allCommands = [];

    // Waterlog Layer (Layer 1) - Process first so main blocks can override
    if (mcStructure_GUI_KEEP_WATERLOG && structProcessor.cubeLayer1) {
        const processedMaskLayer1 = new Uint8Array(totalBlocks); // Fresh mask for this layer
        const waterlogLayerOptions = {
            ignoreListEffective: mcStructure_PLACE_AIR_IN_WATERLOG_LAYER_CONST ? [] : ["minecraft:air"],
            layerName: "Waterlog Layer"
        };
        const waterlogCommands = generateCommandsForLayerMcStructure(1, structProcessor, processedMaskLayer1, mcStructure_GUI_X_OFFSET, mcStructure_GUI_Y_OFFSET, mcStructure_GUI_Z_OFFSET, waterlogLayerOptions);
        allCommands = allCommands.concat(waterlogCommands);
    } else {
        if (mcStructure_GUI_KEEP_WATERLOG) console.log("Skipping waterlog layer (KEEP_WATERLOG true, but layer 1 data missing/invalid).");
    }
    
    // Main Block Layer (Layer 0)
    if (!structProcessor.cubeLayer0) {
         console.error("Critical error: Main block layer (Layer 0) data is missing. Cannot proceed with main layer.");
         return allCommands;
    }
    const processedMaskLayer0 = new Uint8Array(totalBlocks); // Fresh mask for this layer
    const mainLayerOptions = {
        ignoreListEffective: mcStructure_GUI_BLOCKS_TO_IGNORE, // Use the GUI configured ignore list
        layerName: "Main Block Layer"
    };
    const mainCommands = generateCommandsForLayerMcStructure(0, structProcessor, processedMaskLayer0, mcStructure_GUI_X_OFFSET, mcStructure_GUI_Y_OFFSET, mcStructure_GUI_Z_OFFSET, mainLayerOptions);
    allCommands = allCommands.concat(mainCommands); // Main commands come after waterlog

    console.log(`--- Overall Processing Summary ---`);
    console.log(`Total commands generated from all layers: ${allCommands.length}`);
    return allCommands;
}

// ========================================================================== //
//                 START: SCHEMATIC TO MCSTRUCTURE CONVERTER                  //
// ========================================================================== //

/**
 * @file schem_to_mcstructure.js
 * @description Standalone script to convert Minecraft Java Edition .schem files to Bedrock Edition .mcstructure files.
 * @version 2.3.0 - Corrected the waterlogging logic. The script now checks for and separates the waterlogged
 *              state *before* translation, ensuring the water layer is reliably created for all applicable blocks.
 *
 * @requires pako.js - For Gzip decompression of .schem files. (https://github.com/nodeca/pako)
 * @requires mappings.js - A file that defines `window.javaToUniversalMaps` and `window.universalToBedrockMaps`.
 */

// Scope everything to avoid polluting the global namespace
(() => {

// ========================================================================== //
//                              NBT Constants                                 //
// ========================================================================== //

const S2M_TAG_END = 0, S2M_TAG_BYTE = 1, S2M_TAG_SHORT = 2, S2M_TAG_INT = 3, S2M_TAG_LONG = 4, S2M_TAG_FLOAT = 5, S2M_TAG_DOUBLE = 6, S2M_TAG_BYTE_ARRAY = 7, S2M_TAG_STRING = 8, S2M_TAG_LIST = 9, S2M_TAG_COMPOUND = 10, S2M_TAG_INT_ARRAY = 11, S2M_TAG_LONG_ARRAY = 12;

// ========================================================================== //
//                        NBT Reading Helpers (Big-Endian)                    //
// ========================================================================== //

class S2M_BinaryReader {
    constructor(buffer) { this.view = new DataView(buffer); this.position = 0; }
    ensureReadableBytes(c) { if (this.position + c > this.view.byteLength) throw new Error(`NBT Read Error: Not enough bytes.`); }
    readByte() { this.ensureReadableBytes(1); const v = this.view.getInt8(this.position); this.position += 1; return v; }
    readShort() { this.ensureReadableBytes(2); const v = this.view.getInt16(this.position, false); this.position += 2; return v; }
    readInt() { this.ensureReadableBytes(4); const v = this.view.getInt32(this.position, false); this.position += 4; return v; }
    readLong() { this.ensureReadableBytes(8); const v = this.view.getBigInt64(this.position, false); this.position += 8; return v; }
    readFloat() { this.ensureReadableBytes(4); const v = this.view.getFloat32(this.position, false); this.position += 4; return v; }
    readDouble() { this.ensureReadableBytes(8); const v = this.view.getFloat64(this.position, false); this.position += 8; return v; }
    readBytes(len) { this.ensureReadableBytes(len); const b = new Uint8Array(this.view.buffer, this.view.byteOffset + this.position, len); this.position += len; return b; }
    readString() { const len = this.readShort(); if (len < 0) throw new Error(`Invalid string length: ${len}`); return new TextDecoder("utf-8").decode(this.readBytes(len)); }
}

function s2m_readNbtTagPayload(reader, type) {
    switch (type) {
        case S2M_TAG_END: return null;
        case S2M_TAG_BYTE: return reader.readByte();
        case S2M_TAG_SHORT: return reader.readShort();
        case S2M_TAG_INT: return reader.readInt();
        case S2M_TAG_LONG: return reader.readLong();
        case S2M_TAG_FLOAT: return reader.readFloat();
        case S2M_TAG_DOUBLE: return reader.readDouble();
        case S2M_TAG_BYTE_ARRAY: { const len = reader.readInt(); if(len < 0) throw new Error(`Invalid byte array length: ${len}`); return reader.readBytes(len); }
        case S2M_TAG_STRING: return reader.readString();
        case S2M_TAG_LIST: {
            const listType = reader.readByte(); const len = reader.readInt(); if(len < 0) throw new Error(`Invalid list length: ${len}`); const list = [];
            for (let i = 0; i < len; i++) list.push(s2m_readNbtTagPayload(reader, listType));
            return { listType: listType, value: list };
        }
        case S2M_TAG_COMPOUND: {
            const compound = {};
            while (true) {
                const tag = s2m_readNamedNbtTag(reader);
                if (tag === null || tag.type === S2M_TAG_END) break;
                compound[tag.name] = tag.payload;
            }
            return compound;
        }
        case S2M_TAG_INT_ARRAY: { const len = reader.readInt(); if(len < 0) throw new Error(`Invalid int array length: ${len}`); const arr = new Int32Array(len); for (let i = 0; i < len; i++) arr[i] = reader.readInt(); return arr; }
        case S2M_TAG_LONG_ARRAY: { const len = reader.readInt(); if(len < 0) throw new Error(`Invalid long array length: ${len}`); const arr = new BigInt64Array(len); for (let i = 0; i < len; i++) arr[i] = reader.readLong(); return arr; }
        default: throw new Error(`Unsupported NBT tag type: ${type}`);
    }
}

function s2m_readNamedNbtTag(reader) {
    const type = reader.readByte(); if (type === S2M_TAG_END) return { type: S2M_TAG_END, name: "", payload: null };
    const name = reader.readString(); const payload = s2m_readNbtTagPayload(reader, type);
    return { type, name, payload };
}

function s2m_loadSchematicNBT(buffer) {
    const reader = new S2M_BinaryReader(buffer);
    const rootTag = s2m_readNamedNbtTag(reader);
    if (!rootTag || rootTag.type !== S2M_TAG_COMPOUND) throw new Error(`Root tag must be TAG_COMPOUND`);
    if (rootTag.payload.Schematic && Object.keys(rootTag.payload).length === 1) { return rootTag.payload.Schematic; }
    return rootTag.payload;
}

// ========================================================================== //
//                       NBT Writing Helpers (Little-Endian)                  //
// ========================================================================== //

let s2m_nbtWriterCurrentOffset = 0;
function s2m_writeByte(b, o, v) { b.setInt8(o, v); return o + 1; }
function s2m_writeUnsignedShort(b, o, v) { b.setUint16(o, v, true); return o + 2; }
function s2m_writeInt(b, o, v) { b.setInt32(o, v, true); return o + 4; }
function s2m_writeLong(b, o, v) { b.setBigInt64(o, BigInt(v), true); return o + 8; }
function s2m_writeFloat(b, o, v) { b.setFloat32(o, v, true); return o + 4; }
function s2m_writeStringPayload(b, o, t) {
    const bytes = new TextEncoder().encode(t || "");
    o = s2m_writeUnsignedShort(b, o, bytes.length);
    bytes.forEach((byte, i) => b.setUint8(o + i, byte));
    return o + bytes.length;
}
function s2m_getNbtType(v) {
    if (typeof v === "boolean") return S2M_TAG_BYTE;
    if (typeof v === "number") return Number.isInteger(v) ? S2M_TAG_INT : S2M_TAG_FLOAT;
    if (typeof v === "bigint") return S2M_TAG_LONG;
    if (typeof v === "string") return S2M_TAG_STRING;
    if (v instanceof Int32Array) return S2M_TAG_LIST;
    if (Array.isArray(v)) return S2M_TAG_LIST;
    if (v instanceof Uint8Array || v instanceof Int8Array) return S2M_TAG_BYTE_ARRAY;
    if (typeof v === "object" && v !== null) return S2M_TAG_COMPOUND;
    throw new TypeError(`Unsupported JS type for NBT: ${typeof v}`);
}
function s2m_writeTagPayload(b, type, v) {
    switch(type) {
        case S2M_TAG_BYTE: s2m_nbtWriterCurrentOffset = s2m_writeByte(b, s2m_nbtWriterCurrentOffset, v); break;
        case S2M_TAG_INT: s2m_nbtWriterCurrentOffset = s2m_writeInt(b, s2m_nbtWriterCurrentOffset, v); break;
        case S2M_TAG_LONG: s2m_nbtWriterCurrentOffset = s2m_writeLong(b, s2m_nbtWriterCurrentOffset, v); break;
        case S2M_TAG_FLOAT: s2m_nbtWriterCurrentOffset = s2m_writeFloat(b, s2m_nbtWriterCurrentOffset, v); break;
        case S2M_TAG_STRING: s2m_nbtWriterCurrentOffset = s2m_writeStringPayload(b, s2m_nbtWriterCurrentOffset, v); break;
        case S2M_TAG_LIST: s2m_writeList(b, v); break;
        case S2M_TAG_COMPOUND: s2m_writeCompound(b, v); break;
        default: throw new Error(`Unsupported payload type for writing: ${type}`);
    }
}
function s2m_writeList(b, list) {
    if (list instanceof Int32Array) {
        s2m_nbtWriterCurrentOffset = s2m_writeByte(b, s2m_nbtWriterCurrentOffset, S2M_TAG_INT);
        s2m_nbtWriterCurrentOffset = s2m_writeInt(b, s2m_nbtWriterCurrentOffset, list.length);
        for (const item of list) s2m_nbtWriterCurrentOffset = s2m_writeInt(b, s2m_nbtWriterCurrentOffset, item);
        return;
    }
    if (list.length === 0) {
        s2m_nbtWriterCurrentOffset = s2m_writeByte(b, s2m_nbtWriterCurrentOffset, S2M_TAG_END);
        s2m_nbtWriterCurrentOffset = s2m_writeInt(b, s2m_nbtWriterCurrentOffset, 0);
        return;
    }
    const listType = s2m_getNbtType(list[0]);
    s2m_nbtWriterCurrentOffset = s2m_writeByte(b, s2m_nbtWriterCurrentOffset, listType);
    s2m_nbtWriterCurrentOffset = s2m_writeInt(b, s2m_nbtWriterCurrentOffset, list.length);
    for (const item of list) s2m_writeTagPayload(b, listType, item);
}
function s2m_writeCompound(b, compound) {
    for (const key in compound) {
        if (Object.prototype.hasOwnProperty.call(compound, key)) {
            const v = compound[key]; const type = s2m_getNbtType(v);
            s2m_nbtWriterCurrentOffset = s2m_writeByte(b, s2m_nbtWriterCurrentOffset, type);
            s2m_nbtWriterCurrentOffset = s2m_writeStringPayload(b, s2m_nbtWriterCurrentOffset, key);
            s2m_writeTagPayload(b, type, v);
        }
    }
    s2m_nbtWriterCurrentOffset = s2m_writeByte(b, s2m_nbtWriterCurrentOffset, S2M_TAG_END);
}
function s2m_createNbtBuffer(data) {
    const estSize = JSON.stringify(data).length * 2.5 + 4096;
    const arrayBuffer = new ArrayBuffer(estSize);
    const b = new DataView(arrayBuffer);
    s2m_nbtWriterCurrentOffset = 0;
    s2m_nbtWriterCurrentOffset = s2m_writeByte(b, s2m_nbtWriterCurrentOffset, S2M_TAG_COMPOUND);
    s2m_nbtWriterCurrentOffset = s2m_writeStringPayload(b, s2m_nbtWriterCurrentOffset, "");
    s2m_writeCompound(b, data);
    return arrayBuffer.slice(0, s2m_nbtWriterCurrentOffset);
}

// ========================================================================== //
//                 Block Translation & Logging Logic                          //
// ========================================================================== //

function s2m_getBaseBlockName(b) { if (!b) return ''; return b.includes(':') ? b.split(':')[1] : b; }
function s2m_parseJsonStringValue(v) {
    if (typeof v !== 'string') return v;
    try { const p = JSON.parse(v); return (['string', 'number', 'boolean'].includes(typeof p)) ? p : v; } catch (e) { return v; }
}
function s2m_parseJavaBlockString(s) {
    const match = s.match(/([\w:]+)(?:\[([^\]]*)\])?/);
    if (!match) return { blockId: s, states: {}, nbt: null };
    const [, blockId, stateString] = match; const states = {};
    if (stateString) {
        stateString.split(',').forEach(p => {
            if (!p) return; const parts = p.split('=');
            if (parts.length === 2) {
                const key = parts[0].trim(); let v = parts[1].trim();
                if (v.startsWith('"') && v.endsWith('"')) v = v.substring(1, v.length - 1);
                states[key] = v;
            }
        });
    }
    return { blockId: blockId.trim(), states: states || {}, nbt: null };
}

function s2m_javaToUniversal(p, log) {
    const baseName = s2m_getBaseBlockName(p.blockId);
    const rules = window.javaToUniversalMaps[baseName];
    const defaultUni = { name: `universal_minecraft:${baseName}`, properties: p.states || {}, nbt: p.nbt };
    if (!rules) return defaultUni;
    const universal = { name: `universal_minecraft:${baseName}`, properties: {}, nbt: p.nbt };
    try {
        for (const r of rules) { if (r.function === 'new_block') { universal.name = r.options; break; } }
        for (const r of rules) {
            switch (r.function) {
                case 'new_properties': Object.assign(universal.properties, r.options); break;
                case 'carry_properties':
                    for (const key in r.options) {
                        const javaVal = p.states[key];
                        if (javaVal !== undefined && Array.isArray(r.options[key])) {
                            const match = r.options[key].find(v => String(s2m_parseJsonStringValue(v)).toLowerCase() === String(javaVal).toLowerCase());
                            if (match) universal.properties[key] = match;
                        }
                    }
                    break;
                case 'map_properties':
                    for (const key in r.options) {
                        const javaVal = p.states[key];
                        if (javaVal !== undefined) {
                            const mapOpt = r.options[key];
                            const mapForVal = mapOpt?.[javaVal] ?? mapOpt?.[`"${javaVal}"`];
                            if (mapForVal?.[0]?.function === 'new_properties') {
                                Object.assign(universal.properties, mapForVal[0].options);
                            }
                        }
                    }
                    break;
            }
        }
    } catch (e) { console.error(`Error in Java->Universal for ${baseName}:`, e); return defaultUni; }
    if (baseName === 'sea_pickle') {
        universal.properties.pickle_is_dead = p.states.waterlogged === 'false';
        delete p.states.waterlogged;
        log.push(`    - Special sea pickle logic: Universal pickle_is_dead=${universal.properties.pickle_is_dead}`);
    }
    return universal;
}

function s2m_universalToBedrock(u, log) {
    const baseName = s2m_getBaseBlockName(u.name);
    const rules = window.universalToBedrockMaps[baseName];
    const bedrock = { name: `minecraft:${baseName}`, states: {}, version: 18163713 };
    log.push(`  [3] Universal to Bedrock: ${u.name}`);
    if (!rules) {
        log.push(`    - No rules found. Direct conversion.`);
        Object.assign(bedrock.states, u.properties);
    } else {
        try {
            const apply = (nestedRules, currentRep, universalProps) => {
                if (!Array.isArray(nestedRules)) return;
                for (const r of nestedRules) {
                    switch (r.function) {
                        case 'new_block': currentRep.name = r.options; break;
                        case 'new_properties': Object.assign(currentRep.states, r.options); break;
                        case 'map_properties':
                            for (const key in r.options) {
                                const uniVal = universalProps[key];
                                if (uniVal !== undefined) {
                                    const cleanVal = s2m_parseJsonStringValue(uniVal);
                                    const mapForVal = r.options[key]?.[String(cleanVal)] ?? r.options[key]?.[`"${cleanVal}"`];
                                    if (mapForVal) apply(mapForVal, currentRep, universalProps);
                                }
                            }
                            break;
                        case 'carry_properties':
                            for (const key in r.options) {
                                const uniVal = universalProps[key];
                                if (uniVal !== undefined && Array.isArray(r.options[key])) {
                                    const parsedVal = s2m_parseJsonStringValue(uniVal);
                                    if (r.options[key].some(a => String(s2m_parseJsonStringValue(a)).toLowerCase() === String(parsedVal).toLowerCase())) {
                                        currentRep.states[key] = parsedVal;
                                    }
                                }
                            }
                            break;
                    }
                }
            };
            const newBlockRule = rules.find(r => r.function === 'new_block');
            if (newBlockRule) bedrock.name = newBlockRule.options;
            apply(rules.filter(r => r.function !== 'new_block'), bedrock, u.properties);
        } catch (e) { log.push(`    - ✗ ERROR during rule application: ${e.message}`); }
    }
    if (u.properties.hasOwnProperty('pickle_is_dead')) {
        bedrock.states.dead_bit = u.properties.pickle_is_dead === true;
        delete bedrock.states.pickle_is_dead;
        log.push(`    - Special sea pickle logic: Bedrock dead_bit=${bedrock.states.dead_bit}`);
    }
    Object.keys(bedrock.states).forEach(k => { bedrock.states[k] = s2m_parseJsonStringValue(bedrock.states[k]); });
    return bedrock;
}

// ========================================================================== //
//                           Core Conversion Logic                            //
// ========================================================================== //

function s2m_normalizeSchematicData(schemNbt, log) {
    log.push("Normalizing schematic data structure...");
    let width, height, length, palette, blockData;
    if (typeof schemNbt.Width === 'number') { width = schemNbt.Width; height = schemNbt.Height; length = schemNbt.Length; }
    else if (schemNbt.Blocks?.Size?.value) { [width, height, length] = schemNbt.Blocks.Size.value; }
    if (schemNbt.Palette) { palette = schemNbt.Palette; }
    else if (schemNbt.Blocks?.Palette) { palette = schemNbt.Blocks.Palette; }
    if (schemNbt.BlockData instanceof Uint8Array) { blockData = schemNbt.BlockData; }
    else if (schemNbt.Blocks?.Data instanceof Uint8Array) { blockData = schemNbt.Blocks.Data; }
    if (width === undefined || !palette || !blockData) { throw new Error("Could not find all required schematic data in any known format."); }
    log.push("Successfully normalized schematic data.");
    return { width, height, length, palette, blockData };
}

function s2m_translateSchemPalette(schemPaletteNbt, log) {
    log.push("--- Starting Palette Translation Log ---");
    const translatedMap = new Map();
    for (const [javaBlockString, schemIndex] of Object.entries(schemPaletteNbt)) {
        log.push(`\nProcessing Palette Entry #${schemIndex}: ${javaBlockString}`);
        try {
            const parsedJava = s2m_parseJavaBlockString(javaBlockString);
            log.push(`  [1] Parsed Java: ${JSON.stringify(parsedJava, null, 2).replace(/\n/g, '\n      ')}`);
            
            // ** CORRECTED WATERLOGIC: Check for water BEFORE translation **
            let isWaterlogged = parsedJava.states.waterlogged === 'true';
            // Sea pickles are handled differently and are not part of the generic water layer.
            if (s2m_getBaseBlockName(parsedJava.blockId) === 'sea_pickle') {
                isWaterlogged = false;
            }
            // If it's a generic waterlogged block, remove the state so it doesn't affect the main block's translation.
            if (isWaterlogged) {
                delete parsedJava.states.waterlogged;
                log.push("    - Detected generic waterlogged state. It will be processed as a separate layer.");
            }

            const universal = s2m_javaToUniversal(parsedJava, log);
            log.push(`  [2] Mapped to Universal: ${JSON.stringify(universal, null, 2).replace(/\n/g, '\n      ')}`);
            const bedrock = s2m_universalToBedrock(universal, log);
            log.push(`  [✓] Final Bedrock Block: ${JSON.stringify(bedrock, null, 2).replace(/\n/g, '\n      ')}`);

            // Store both the translated block AND its waterlogged status
            translatedMap.set(schemIndex, { bedrockBlock: bedrock, isWaterlogged });
        } catch (error) {
            log.push(`  [!] FAILED with error: ${error.message}`);
        }
    }
    log.push("\n--- End of Palette Translation Log ---");
    return translatedMap;
}

function* s2m_varIntIterator(byteArray) {
    let index = 0;
    while (index < byteArray.length) {
        let value = 0, shift = 0, byte;
        do {
            if (index >= byteArray.length) throw new Error("VarInt read error: Unexpected end of buffer.");
            byte = byteArray[index++];
            value |= (byte & 0x7F) << shift;
            shift += 7;
        } while ((byte & 0x80) !== 0);
        yield value;
    }
}

async function convertSchemToMcStructure(schemArrayBuffer) {
    return new Promise((resolve, reject) => {
        const log = [];
        try {
            log.push("Starting Schematic to MCStructure conversion...");
            if (typeof pako === 'undefined') throw new Error("Pako.js is not loaded.");
            let nbtBuffer;
            const fileData = new Uint8Array(schemArrayBuffer);
            if (fileData[0] === 0x1f && fileData[1] === 0x8b) {
                log.push("Decompressing Gzipped schematic...");
                nbtBuffer = pako.inflate(fileData).buffer;
            } else { log.push("Processing uncompressed schematic..."); nbtBuffer = schemArrayBuffer; }
            
            log.push("Parsing schematic NBT data...");
            const schemNbt = s2m_loadSchematicNBT(nbtBuffer);
            const { width, height, length, palette: schemPalette, blockData } = s2m_normalizeSchematicData(schemNbt, log);
            log.push(`Schematic dimensions: ${width}x${height}x${length}`);

            const translatedPaletteMap = s2m_translateSchemPalette(schemPalette, log);
            
            log.push("\nBuilding new Bedrock structure object...");
            const mcstructure = {
                format_version: 1, size: new Int32Array([width, height, length]), structure_world_origin: new Int32Array([0, 0, 0]),
                structure: {
                    block_indices: [new Int32Array(width * height * length).fill(-1), new Int32Array(width * height * length).fill(-1)],
                    entities: [], palette: { default: { block_palette: [], block_position_data: {} } }
                }
            };
            const bedrockPalette = mcstructure.structure.palette.default.block_palette;
            const uniqueBlocksMap = new Map();
            const iterator = s2m_varIntIterator(blockData);

            for (let y = 0; y < height; y++) for (let z = 0; z < length; z++) for (let x = 0; x < width; x++) {
                const schemPaletteIndex = iterator.next().value;
                const paletteEntry = translatedPaletteMap.get(schemPaletteIndex);
                if (!paletteEntry) continue;

                const { bedrockBlock, isWaterlogged } = paletteEntry;
                const destIndex = (x * height * length) + (y * length) + z;

                if (bedrockBlock && bedrockBlock.name !== 'minecraft:air') {
                    const blockKey = JSON.stringify({ name: bedrockBlock.name, states: bedrockBlock.states });
                    let bedrockPaletteIndex = uniqueBlocksMap.get(blockKey);
                    if (bedrockPaletteIndex === undefined) {
                        bedrockPaletteIndex = bedrockPalette.length;
                        bedrockPalette.push(bedrockBlock);
                        uniqueBlocksMap.set(blockKey, bedrockPaletteIndex);
                    }
                    mcstructure.structure.block_indices[0][destIndex] = bedrockPaletteIndex;
                }

                if (isWaterlogged) {
                    const waterKey = '{"name":"minecraft:water","states":{}}';
                    let waterIdx = uniqueBlocksMap.get(waterKey);
                    if (waterIdx === undefined) {
                        waterIdx = bedrockPalette.length;
                        bedrockPalette.push({ name: 'minecraft:water', states: {}, version: 18163713 });
                        uniqueBlocksMap.set(waterKey, waterIdx);
                    }
                    mcstructure.structure.block_indices[1][destIndex] = waterIdx;
                }
            }
            log.push(`Structure built with a new palette of ${bedrockPalette.length} unique blocks.`);
            log.push("Serializing to Little-Endian NBT for .mcstructure file...");
            const mcstructureBuffer = s2m_createNbtBuffer(mcstructure);
            log.push("Conversion successful!");
            resolve({ mcstructureBuffer, log: log.join('\n') });
        } catch (error) {
            log.push(`\n--- CONVERSION FAILED ---\nERROR: ${error.message}\nStack: ${error.stack}`);
            console.error("An error occurred during conversion:", error);
            reject({ error, log: log.join('\n') });
        }
    });
}

window.convertSchemToMcStructure = convertSchemToMcStructure;

})();
// ========================================================================== //
//                  END: SCHEMATIC TO MCSTRUCTURE CONVERTER                   //
// ========================================================================== //


// ========================================================================== //
//                           UI Interaction Logic                             //
// ========================================================================== //

document.addEventListener('DOMContentLoaded', function() {
    // --- General UI Elements ---
    const hamburgerButton = document.getElementById('hamburger-button');
    const sidebar = document.getElementById('sidebar');
    const sidebarLinks = document.querySelectorAll('#sidebar .tool-link');
    const toolSections = document.querySelectorAll('.tool-section');
    const closeSidebarButton = document.getElementById('close-sidebar-button');

    // Commands to Structure
    const cmdStructDropArea = document.getElementById('cmd-struct-drop-area');
    const cmdStructInputFile = document.getElementById('cmd-struct-input-file');
    const cmdStructConvertButton = document.getElementById('cmd-struct-convert-button');
    const cmdStructOutputPreview = document.getElementById('cmd-struct-output-preview');
    const cmdStructPreviewContainer = document.getElementById('cmd-struct-preview-container');
    const cmdStructPreviewText = document.getElementById('cmd-struct-preview-text');
    const cmdStructDownloadButton = document.getElementById('cmd-struct-download-button');
    const cmdStructValidationMessage = document.getElementById('cmd-struct-validation-message');
    const cmdStructFileNameDisplay = cmdStructDropArea ? cmdStructDropArea.querySelector('span.file-name-display') : null;

    // NBT to Raw
    const nbtToRawDropArea = document.getElementById('nbt-raw-drop-area');
    const nbtToRawInputFile = document.getElementById('nbt-raw-input-file');
    const nbtToRawExtractButton = document.getElementById('nbt-raw-extract-button');
    const nbtToRawOutputPreview = document.getElementById('nbt-raw-output-preview');
    const nbtToRawPreviewText = document.getElementById('nbt-raw-preview-text');
    const nbtToRawDownloadButton = document.getElementById('nbt-raw-download-button');
    const nbtToRawValidationMessage = document.getElementById('nbt-raw-validation-message');
    const nbtToRawFilterCheckbox = document.getElementById('nbt-raw-filter-checkbox');
    const nbtToRawFileNameDisplay = nbtToRawDropArea ? nbtToRawDropArea.querySelector('span.file-name-display') : null;

    // Schematic to Commands
    const schemDropArea = document.getElementById('schem-drop-area');
    const schemInputFile = document.getElementById('schem-input-file');
    const schemFileNameDisplay = document.getElementById('schem-file-name');
    const schemGenerateButton = document.getElementById('schem-generate-button');
    const schemOutputNameInput = document.getElementById('schem-outputName');
    const schemIncludeAirCheckbox = document.getElementById('schem-includeAir');
    const schemIncludeBlockStatesCheckbox = document.getElementById('schem-includeBlockStates');
    const schemProcessWaterloggingCheckbox = document.getElementById('schem-processWaterlogging');
    const schemOffsetXInput = document.getElementById('schem-offsetX');
    const schemOffsetYInput = document.getElementById('schem-offsetY');
    const schemOffsetZInput = document.getElementById('schem-offsetZ');
    const schemStatusDiv = document.getElementById('schem-status');

    // MCStructure to Commands
    const mcstructureDropArea = document.getElementById('mcstructure-drop-area');
    const mcstructureFileInput = document.getElementById('mcstructure-file-input');
    const mcstructureFileNameDisplay = document.getElementById('mcstructure-file-name');
    const mcstructureGenerateButton = document.getElementById('mcstructure-generate-button');
    const mcstructureStatusDiv = document.getElementById('mcstructure-status');
    const mcstructureOutputNameInput = document.getElementById('mcstructure-outputName');
    const mcstructureIncludeAirCheckbox = document.getElementById('mcstructure-includeAir');
    const mcstructureIncludeBlockStatesCheckbox = document.getElementById('mcstructure-includeBlockStates');
    const mcstructureProcessWaterlogLayerCheckbox = document.getElementById('mcstructure-processWaterlogLayer');
    const mcstructureOffsetXInput = document.getElementById('mcstructure-offsetX');
    const mcstructureOffsetYInput = document.getElementById('mcstructure-offsetY');
    const mcstructureOffsetZInput = document.getElementById('mcstructure-offsetZ');

    // Schematic to MCStructure
    const schemMcstructureDropArea = document.getElementById('schem-mcstructure-drop-area');
    const schemMcstructureInputFile = document.getElementById('schem-mcstructure-input-file');
    const schemMcstructureFileNameDisplay = document.getElementById('schem-mcstructure-file-name');
    const schemMcstructureConvertButton = document.getElementById('schem-mcstructure-convert-button');
    const schemMcstructureStatusDiv = document.getElementById('schem-mcstructure-status');
    const schemMcstructureLogViewer = document.getElementById('schem-mcstructure-log-viewer');
    const schemMcstructureLogPreview = document.getElementById('schem-mcstructure-log-preview');
    const schemMcstructureDownloadLogButton = document.getElementById('schem-mcstructure-download-log-button');
    let schemMcstructureFileObject = null;


    // --- Helper Functions ---
    function showValidationMessage(element, message, type = 'error') {
        if (!element) return;
        element.textContent = message;
        element.className = 'validation-message'; // Reset classes
        element.classList.add(type);
        element.style.display = 'block';
        if (type !== 'info' && type !== 'success_long') {
            setTimeout(() => {
                 if (element.style.display === 'block' && element.textContent === message) {
                     element.style.display = 'none';
                 }
            }, 5000);
        }
         if (type === 'success_long') {
            element.classList.remove('success_long');
            element.classList.add('success');
        }
    }

    function hideValidationMessage(element) {
        if (element) {
            element.textContent = '';
            element.style.display = 'none';
            element.className = 'validation-message';
        }
    }

    function setupDropAreaListeners(dropArea, fileInput, fileNameDisplayElement) {
        if (!dropArea || !fileInput || !fileNameDisplayElement) {
             console.warn("setupDropAreaListeners: Missing required elements for", fileInput?.id);
             return;
        }
        const clickHandler = () => { fileInput.click(); };
        dropArea.addEventListener('click', clickHandler);
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, preventDefaults, false);
        });
        ['dragenter', 'dragover'].forEach(eventName => {
            dropArea.addEventListener(eventName, () => dropArea.classList.add('dragover'), false);
        });
        ['dragleave', 'drop'].forEach(eventName => {
            dropArea.addEventListener(eventName, () => dropArea.classList.remove('dragover'), false);
        });
        dropArea.addEventListener('drop', (e) => {
            const dt = e.dataTransfer; const files = dt.files;
            if (files.length > 0) {
                fileInput.files = files;
                const event = new Event('change', { bubbles: true });
                fileInput.dispatchEvent(event);
            }
        }, false);
        function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }
    }

    function setupFileInputHandler(fileInput, fileObjectSetter, fileNameDisplayElement, validationElement, allowedExtensions = [], fileReadFunction) {
         if (!fileInput || !fileNameDisplayElement || !validationElement) {
             console.warn("setupFileInputHandler: Missing required elements for", fileInput?.id);
             return;
         }
        const defaultDisplayText = 'No file selected';
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                let isValid = false; const lowerName = file.name.toLowerCase();
                if (allowedExtensions.length === 0) { isValid = true; }
                else { isValid = allowedExtensions.some(ext => lowerName.endsWith(ext)); }

                if (isValid) {
                    fileNameDisplayElement.textContent = file.name + ' selected.';
                    hideValidationMessage(validationElement);
                    if (fileReadFunction) { fileReadFunction(file, fileObjectSetter); }
                    else { fileObjectSetter(file); }
                } else {
                    showValidationMessage(validationElement, `Invalid file type. Expected: ${allowedExtensions.join(', ')}`, 'error');
                    fileNameDisplayElement.textContent = defaultDisplayText;
                    fileObjectSetter(null); fileInput.value = '';
                }
            } else {
                fileNameDisplayElement.textContent = defaultDisplayText;
                fileObjectSetter(null); hideValidationMessage(validationElement);
            }
        });
    }

     // --- Navigation Logic ---
    if (hamburgerButton && sidebar) {
        hamburgerButton.addEventListener('click', (e) => { e.stopPropagation(); sidebar.classList.toggle('active'); });
    }
    if (closeSidebarButton && sidebar) {
         closeSidebarButton.addEventListener('click', () => { sidebar.classList.remove('active'); });
     }
    document.addEventListener('click', (e) => {
        if (sidebar && sidebar.classList.contains('active') && !sidebar.contains(e.target) && e.target !== hamburgerButton && !hamburgerButton.contains(e.target)) {
             sidebar.classList.remove('active');
        }
    });
    sidebarLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetToolId = link.getAttribute('data-tool');
            toolSections.forEach(section => { section.classList.remove('active'); section.style.display = 'none'; });
            sidebarLinks.forEach(s_link => s_link.classList.remove('active'));
            const targetSection = document.getElementById(targetToolId);
            if (targetSection) {
                targetSection.classList.add('active'); targetSection.style.display = 'block';
                link.classList.add('active'); console.log(`Switched to tool: ${targetToolId}`);
            } else { console.error(`Tool section with ID ${targetToolId} not found.`); }
            if (sidebar) sidebar.classList.remove('active');
        });
    });
    toolSections.forEach((section, index) => {
        if (index === 0) {
            section.classList.add('active'); section.style.display = 'block';
            const firstLinkId = section.id;
            const firstLink = document.querySelector(`.tool-link[data-tool="${firstLinkId}"]`);
            if (firstLink) firstLink.classList.add('active');
        } else { section.classList.remove('active'); section.style.display = 'none'; }
    });

    // --- Generic File Reader (Text) ---
    function readFileAsText(file, contentSetter) {
        const reader = new FileReader();
        reader.onload = function(e) { contentSetter(e.target.result); console.log(`${file.name} read successfully (Text).`); };
        reader.onerror = function(e) { console.error(`Error reading file ${file.name}:`, e); contentSetter(''); };
        reader.readAsText(file);
    }
    function downloadFile(content, fileName, contentType) {
        const a = document.createElement('a'); const file = new Blob([content], { type: contentType });
        a.href = URL.createObjectURL(file); a.download = fileName;
        document.body.appendChild(a); a.click();
        URL.revokeObjectURL(a.href); document.body.removeChild(a);
    }

    // --- Raw to NBT Listeners (Updated) ---
    const rawToNbtDropArea = document.getElementById('raw-to-nbt-drop-area');
    const rawToNbtInputFile = document.getElementById('raw-to-nbt-input-file');
    const rawToNbtGenerateButton = document.getElementById('raw-to-nbt-generate-button');
    const rawToNbtNbtTitleInput = document.getElementById('raw-to-nbt-nbt-title');
    const rawToNbtBytesInput = document.getElementById('raw-to-nbt-bytes-per-npc');
    const rawToNbtPreviewArea = document.getElementById('raw-to-nbt-output-preview');
    const rawToNbtPreviewTextarea = document.getElementById('raw-to-nbt-preview-text');
    const rawToNbtDownloadBtn = document.getElementById('raw-to-nbt-download-button');
    const rawToNbtValidationMsg = document.getElementById('raw-to-nbt-validation-message');
    const rawToNbtFileNameDisplay = rawToNbtDropArea ? rawToNbtDropArea.querySelector('span.file-name-display') : null;

    function rawToNbtReadFile(file, contentSetter) {
      const reader = new FileReader();
      reader.onload = function(e) {
        contentSetter(e.target.result);
        if (rawToNbtFileNameDisplay) rawToNbtFileNameDisplay.textContent = `${file.name} loaded. Ready to generate NBT.`;
        rawToNbtPreviewArea.style.display = 'none'; rawToNbtDownloadBtn.disabled = true;
        hideValidationMessage(rawToNbtValidationMsg);
      };
      reader.onerror = function() { showValidationMessage(rawToNbtValidationMsg, 'Error reading file.', 'error'); };
      reader.readAsText(file);
    }

    if(rawToNbtDropArea) {
        setupDropAreaListeners(rawToNbtDropArea, rawToNbtInputFile, rawToNbtFileNameDisplay);
        setupFileInputHandler(rawToNbtInputFile, (content) => { rawToNbtFileContent = content; }, rawToNbtFileNameDisplay, rawToNbtValidationMsg, ['.txt'], rawToNbtReadFile);
    }

    if(rawToNbtGenerateButton) {
      rawToNbtGenerateButton.addEventListener('click', () => {
        if (!rawToNbtFileContent) { showValidationMessage(rawToNbtValidationMsg, 'Please select a file.'); return; }
        const nbtTitle = rawToNbtNbtTitleInput.value.trim();
        const maxBytesInput = rawToNbtBytesInput.value.trim(); let maxBytes;
        try {
            maxBytes = parseInt(maxBytesInput, 10);
            if (isNaN(maxBytes) || maxBytes <= 500) throw new Error("Value must be a number > 500");
        } catch(e) {
            showValidationMessage(rawToNbtValidationMsg, 'Please enter a valid positive integer (> 500) for Max Bytes per NPC.');
            return;
        }
        hideValidationMessage(rawToNbtValidationMsg);
        try {
            showValidationMessage(rawToNbtValidationMsg, 'Generating NBT...', 'info');
             const commands = getUsefulCommands(rawToNbtFileContent);
             const { normalCommands, equalsCommands } = separateCommands(commands);
             const nbtName = nbtTitle || 'Blacklight NBT';
             let nbtData = getBlockOpener(nbtName); let curSec = 1; let combinedNpcData = [];

             if (normalCommands.length > 0) {
                 const result = processNpcCommandsByBytes(normalCommands, maxBytes, nbtName, curSec, commandJoinerNormal, false);
                 if (result.npcData) combinedNpcData.push(result.npcData);
                 curSec += result.count;
             }
             if (equalsCommands.length > 0) {
                 const result = processNpcCommandsByBytes(equalsCommands, maxBytes, nbtName, curSec, commandJoinerEquals, true);
                  if (result.npcData) combinedNpcData.push(result.npcData);
             }
             nbtData += combinedNpcData.join(',');
             nbtData += getBlockCloser();
             rawToNbtPreviewTextarea.value = nbtData;
             rawToNbtPreviewArea.style.display = 'block';
             rawToNbtDownloadBtn.disabled = false;
             hideValidationMessage(rawToNbtValidationMsg);
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

    if(rawToNbtDownloadBtn) {
      rawToNbtDownloadBtn.addEventListener('click', () => {
        const nbtText = rawToNbtPreviewTextarea.value;
        if (!nbtText) { showValidationMessage(rawToNbtValidationMsg, 'No NBT data generated to download.'); return; }
        const nbtTitle = rawToNbtNbtTitleInput.value.trim();
        const nbtName = nbtTitle || 'Blacklight_NBT';
        const fileName = `Horion ${nbtName} Build.txt`;
        downloadFile(nbtText, fileName, 'text/plain;charset=utf-8');
        showValidationMessage(rawToNbtValidationMsg, 'NBT file download started.', 'success');
      });
    }

    // --- Commands to Structure Setup (Updated) ---
    if(cmdStructDropArea) {
        setupDropAreaListeners(cmdStructDropArea, cmdStructInputFile, cmdStructFileNameDisplay);
        setupFileInputHandler(cmdStructInputFile, (content) => { cmdStructFileContent = content; }, cmdStructFileNameDisplay, cmdStructValidationMessage, ['.txt'], readFileAsText);
    }
    if (cmdStructConvertButton) {
        cmdStructConvertButton.addEventListener('click', () => {
            if (!cmdStructFileContent) { showValidationMessage(cmdStructValidationMessage, 'Please select a commands text file first.', 'error'); return; }
            hideValidationMessage(cmdStructValidationMessage); showValidationMessage(cmdStructValidationMessage, 'Processing commands and converting...', 'info');
            cmdStructConvertButton.disabled = true;
            setTimeout(() => {
                try {
                    const processResult = processCmdStructCommands(cmdStructFileContent);
                    if (!processResult.blocksFound) {
                        hideValidationMessage(cmdStructValidationMessage); showValidationMessage(cmdStructValidationMessage, 'No valid blocks found in commands. Check file format or content.', 'error');
                        cmdStructOutputPreview.style.display = 'none'; commandsToStructureData = null; return;
                    }
                    const result = convertToStructureData();
                    if (!result.success) {
                        hideValidationMessage(cmdStructValidationMessage); showValidationMessage(cmdStructValidationMessage, result.message || 'Failed to convert processed blocks to structure data.', 'error');
                        cmdStructOutputPreview.style.display = 'none'; commandsToStructureData = null; return;
                    }
                    const previewJson = JSON.stringify(commandsToStructureData, null, 2);
                    cmdStructPreviewText.textContent = previewJson;
                    const existingStats = cmdStructPreviewContainer.querySelector('.alert.alert-info');
                    if (existingStats) existingStats.remove();
                    const statsHtml = `<div class="alert alert-info mt-3 mb-3"><p class="mb-1"><strong>Structure Dimensions:</strong> ${result.dimensions.width}×${result.dimensions.height}×${result.dimensions.depth}</p><p class="mb-1"><strong>World Origin Offset:</strong> [${result.origin.join(', ')}]</p><p class="mb-1"><strong>Actual Solid Blocks:</strong> ${result.solidBlockCount}</p><p class="mb-1"><strong>Actual Liquid Blocks (e.g., Water):</strong> ${result.liquidBlockCount}</p><p class="mb-0"><strong>Unique Block Types (Palette Size):</strong> ${result.paletteCount}</p></div>`;
                    cmdStructPreviewText.insertAdjacentHTML('beforebegin', statsHtml);
                    cmdStructOutputPreview.style.display = 'block'; cmdStructDownloadButton.disabled = false;
                    hideValidationMessage(cmdStructValidationMessage); showValidationMessage(cmdStructValidationMessage, `Conversion successful. Found ${result.solidBlockCount} solid and ${result.liquidBlockCount} liquid blocks.`, 'success');
                } catch (e) {
                    console.error("CmdStruct Conversion Error:", e); hideValidationMessage(cmdStructValidationMessage);
                    showValidationMessage(cmdStructValidationMessage, `Error during conversion: ${e.message}`, 'error');
                    cmdStructOutputPreview.style.display = 'none'; cmdStructDownloadButton.disabled = true; commandsToStructureData = null;
                } finally { cmdStructConvertButton.disabled = false; }
            }, 50);
        });
    }
    if (cmdStructDownloadButton) {
        cmdStructDownloadButton.addEventListener('click', () => {
            if (!commandsToStructureData || !commandsToStructureData.size || commandsToStructureData.size.some(dim => dim <= 0)) {
                showValidationMessage(cmdStructValidationMessage, 'No valid structure data generated or structure is empty. Convert commands first.', 'error'); return;
            }
            hideValidationMessage(cmdStructValidationMessage); showValidationMessage(cmdStructValidationMessage, 'Creating NBT buffer for .mcstructure file...', 'info');
            cmdStructDownloadButton.disabled = true;
            setTimeout(() => {
                try {
                    const nbtBuffer = createNbtBuffer(commandsToStructureData);
                    console.log(`CmdStruct: NBT buffer created, size: ${nbtBuffer.byteLength} bytes.`);
                    downloadFile(nbtBuffer, 'converted_structure.mcstructure', 'application/octet-stream');
                    hideValidationMessage(cmdStructValidationMessage); showValidationMessage(cmdStructValidationMessage, '.mcstructure file download started!', 'success');
                } catch (bufferError) {
                    console.error("CmdStruct: Error creating/downloading .mcstructure file:", bufferError); hideValidationMessage(cmdStructValidationMessage);
                    showValidationMessage(cmdStructValidationMessage, `Error creating structure file: ${bufferError.message}.`, 'error');
                } finally { cmdStructDownloadButton.disabled = false; }
            }, 100);
        });
    }

    // --- NBT to Raw Setup ---
     if(nbtToRawDropArea) {
        setupDropAreaListeners(nbtToRawDropArea, nbtToRawInputFile, nbtToRawFileNameDisplay);
        setupFileInputHandler(
            nbtToRawInputFile,
            (content) => { nbtToRawFileContent = content; },
            nbtToRawFileNameDisplay,
            nbtToRawValidationMessage,
            ['.nbt', '.mcstructure', '.txt'],
            readFileAsText
        );
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
            nbtToRawExtractButton.disabled = true;

            const filterEnabled = nbtToRawFilterCheckbox.checked;
            showValidationMessage(nbtToRawValidationMessage, 'Extracting commands from text...', 'info');

             setTimeout(() => {
                 try {
                    let finalCommands = extractFillSetblockCommandsFromHorionText(nbtToRawFileContent);

                    // The checkbox is now redundant as the function only gets fill/setblock, but we keep the UI interaction
                    if (!filterEnabled) {
                        // In the future, if the extraction logic changes to get ALL commands, this branch would be useful.
                        // For now, it does nothing extra.
                    }

                    if (finalCommands.length > 0) {
                        nbtToRawPreviewText.value = finalCommands.join('\n');
                        hideValidationMessage(nbtToRawValidationMessage);
                        showValidationMessage(nbtToRawValidationMessage, `Extracted ${finalCommands.length} fill/setblock commands.`, 'success');
                    } else {
                        nbtToRawPreviewText.value = `// No fill/setblock commands found in the "Actions" blocks of the text file.`;
                        hideValidationMessage(nbtToRawValidationMessage);
                        showValidationMessage(nbtToRawValidationMessage, `No matching commands found in "Actions" blocks. This tool specifically targets formats like Horion NBT output.`, 'info');
                    }
                    nbtToRawOutputPreview.style.display = 'block';
                    nbtToRawDownloadButton.disabled = (finalCommands.length === 0);
                } catch (err) {
                    console.error("NBTtoRaw Extraction Error:", err);
                    hideValidationMessage(nbtToRawValidationMessage);
                    showValidationMessage(nbtToRawValidationMessage, `An error occurred during command extraction: ${err.message}`, 'error');
                    nbtToRawOutputPreview.style.display = 'none';
                    nbtToRawDownloadButton.disabled = true;
                } finally {
                     nbtToRawExtractButton.disabled = false;
                 }
            }, 50);
        });
    }
     if (nbtToRawDownloadButton) {
        nbtToRawDownloadButton.addEventListener('click', () => {
            const textToSave = nbtToRawPreviewText.value;
            if (!textToSave || textToSave.startsWith("// No fill/setblock commands")) {
                showValidationMessage(nbtToRawValidationMessage, "No valid command content to download.", 'error');
                return;
            }
            const originalFileName = nbtToRawInputFile.files[0]?.name || 'extracted_commands';
            const baseName = originalFileName.replace(/\.[^/.]+$/, "");
            downloadFile(textToSave, `${baseName}_raw_commands.txt`, 'text/plain;charset=utf-8');
            showValidationMessage(nbtToRawValidationMessage, 'Raw commands file download started.', 'success');
        });
    }

    // --- Schematic to Commands Setup (Updated) ---
     function displaySchemStatus(message, type = 'info') {
        if (!schemStatusDiv) return;
        showValidationMessage(schemStatusDiv, message, type);
    }
     if (schemDropArea && schemInputFile && schemFileNameDisplay) {
         setupDropAreaListeners(schemDropArea, schemInputFile, schemFileNameDisplay);
         setupFileInputHandler(schemInputFile, (file) => { schemFileObject = file; }, schemFileNameDisplay, schemStatusDiv, ['.schem', '.schematic']);
     }
     if (schemGenerateButton) {
        schemGenerateButton.addEventListener('click', () => {
            const file = schemFileObject;
            const outputNameBase = schemOutputNameInput.value.trim() || 'SchemCommands';
            const includeAir = schemIncludeAirCheckbox.checked;
            const includeBlockStates = schemIncludeBlockStatesCheckbox.checked;
            const processWaterlogging = schemProcessWaterloggingCheckbox.checked;
            const offsetX = parseInt(schemOffsetXInput.value, 10) || 0;
            const offsetY = parseInt(schemOffsetYInput.value, 10) || 0;
            const offsetZ = parseInt(schemOffsetZInput.value, 10) || 0;

            if (!file) { displaySchemStatus('Please select a .schem or .schematic file first!', 'error'); return; }
            displaySchemStatus('Reading schematic file...', 'info');
            schemGenerateButton.disabled = true;

            const reader = new FileReader();
            reader.onload = function(event) {
                try {
                    displaySchemStatus('Decompressing and parsing NBT...', 'info');
                    const fileData = new Uint8Array(event.target.result);
                    let nbtDataBuffer;
                    if (fileData.length >= 2 && fileData[0] === 0x1f && fileData[1] === 0x8b) {
                        if (typeof pako === 'undefined') throw new Error("Pako library is not loaded.");
                        const decompressedData = pako.inflate(fileData);
                        nbtDataBuffer = decompressedData.buffer;
                    } else {
                        nbtDataBuffer = fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength);
                    }
                     if (!nbtDataBuffer || nbtDataBuffer.byteLength === 0) throw new Error("Failed to get valid data buffer.");

                    const schematicNbt = loadSchematicNBT(nbtDataBuffer);
                    let width, height, length, dataContainerNbt;

                    if (typeof schematicNbt.Width === 'number' && typeof schematicNbt.Height === 'number' && typeof schematicNbt.Length === 'number') {
                        width = schematicNbt.Width; height = schematicNbt.Height; length = schematicNbt.Length; dataContainerNbt = schematicNbt;
                    } else if (schematicNbt.Schematic && typeof schematicNbt.Schematic.Width === 'number') {
                         width = schematicNbt.Schematic.Width; height = schematicNbt.Schematic.Height; length = schematicNbt.Schematic.Length; dataContainerNbt = schematicNbt.Schematic;
                    } else { throw new Error("Could not find standard dimension tags (Width, Height, Length)."); }

                    if (width <= 0 || height <= 0 || length <= 0) throw new Error(`Invalid dimensions: W=${width}, H=${height}, L=${length}`);
                    const dims = [width, height, length];
                    const offsetArr = [offsetX, offsetY, offsetZ];

                    displaySchemStatus(`Generating commands for ${width}x${height}x${length} structure...`, 'info');
                    const {commands, processedBlockCount} = generateSchemCommands(dataContainerNbt, dims, offsetArr, includeAir, includeBlockStates, processWaterlogging);

                    if (commands.length === 0 && processedBlockCount > 0) {
                        displaySchemStatus('Warning: Schematic processed, but no commands generated (possibly only air).', 'info');
                        return;
                    }
                    if (commands.length === 0 && processedBlockCount === 0) {
                        displaySchemStatus('Warning: No blocks processed and no commands generated. Is the schematic empty or invalid?', 'info');
                        return;
                    }

                    const now = new Date();
                    const timestamp = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`;
                    downloadFile(commands.join('\n'), `${outputNameBase}_${timestamp}.txt`, 'text/plain;charset=utf-8');
                    displaySchemStatus(`Success! ${commands.length} commands generated and download started.`, 'success');
                } catch (e) {
                    console.error("Schematic Processing Error:", e);
                    displaySchemStatus(`Error: ${e.message}`, 'error');
                } finally {
                    schemGenerateButton.disabled = false;
                }
            };
            reader.onerror = () => {
                displaySchemStatus('Error reading the selected schematic file.', 'error');
                schemGenerateButton.disabled = false;
            };
            reader.readAsArrayBuffer(file);
        });
    }

    // --- MCStructure to Commands Setup ---
    function displayMcStructureStatus(message, type = 'info') {
        if (!mcstructureStatusDiv) return;
        showValidationMessage(mcstructureStatusDiv, message, type);
    }
    if (mcstructureDropArea && mcstructureFileInput && mcstructureFileNameDisplay) {
        setupDropAreaListeners(mcstructureDropArea, mcstructureFileInput, mcstructureFileNameDisplay);
        setupFileInputHandler(mcstructureFileInput, (file) => { mcStructure_selectedFile = file; }, mcstructureFileNameDisplay, mcstructureStatusDiv, ['.mcstructure']);
    }
    if (mcstructureGenerateButton) {
        mcstructureGenerateButton.addEventListener('click', async () => {
            if (!mcStructure_selectedFile) { displayMcStructureStatus('Please select a .mcstructure file first.', 'error'); return; }
            mcStructure_GUI_X_OFFSET = parseInt(mcstructureOffsetXInput.value, 10) || 0;
            mcStructure_GUI_Y_OFFSET = parseInt(mcstructureOffsetYInput.value, 10) || 0;
            mcStructure_GUI_Z_OFFSET = parseInt(mcstructureOffsetZInput.value, 10) || 0;
            const baseIgnore = ["minecraft:structure_block", "minecraft:structure_void"];
            if (mcstructureIncludeAirCheckbox.checked) { mcStructure_GUI_BLOCKS_TO_IGNORE = [...baseIgnore]; }
            else { mcStructure_GUI_BLOCKS_TO_IGNORE = ["minecraft:air", ...baseIgnore]; }
            mcStructure_GUI_KEEP_WATERLOG = mcstructureProcessWaterlogLayerCheckbox.checked;
            mcStructure_GUI_INCLUDE_BLOCK_STATES = mcstructureIncludeBlockStatesCheckbox.checked;
            const outputBaseName = mcstructureOutputNameInput.value.trim() || "Generated_Structure";
            const outputFileName = `${outputBaseName}_commands.txt`;
            displayMcStructureStatus('Processing .mcstructure file... This may take a moment.', 'info');
            mcstructureGenerateButton.disabled = true;
            try {
                const fileBuffer = await mcStructure_selectedFile.arrayBuffer(); let nbtDataBuffer;
                try {
                    const decompressed = pako.inflate(new Uint8Array(fileBuffer)); nbtDataBuffer = decompressed.buffer;
                    console.log("MCStructure: Successfully decompressed Gzipped NBT data with Pako.");
                    displayMcStructureStatus('Decompressed Gzipped NBT data. Parsing structure...', 'info');
                } catch (e) {
                    console.log("MCStructure: File does not appear to be Gzipped (Pako inflate failed), processing as raw NBT.");
                    nbtDataBuffer = fileBuffer;
                    displayMcStructureStatus('Processing as raw NBT data (not Gzipped). Parsing structure...', 'info');
                }
                const generatedCommands = structureToRelativeSetblocksMcStructure(nbtDataBuffer);
                if (generatedCommands === null || typeof generatedCommands === 'undefined') {
                    displayMcStructureStatus("Command generation failed due to critical errors during structure processing.", 'error');
                } else if (generatedCommands.length === 0) {
                    displayMcStructureStatus('No commands were generated. The structure might be empty or only contain ignored blocks.', 'info');
                } else {
                    downloadFile(generatedCommands.join('\n'), outputFileName, 'text/plain;charset=utf-8');
                    displayMcStructureStatus(`Successfully generated ${generatedCommands.length} commands. Download started as '${outputFileName}'.`, 'success_long');
                }
            } catch (error) {
                console.error("--- MCStructure CRITICAL ERROR ---", error);
                displayMcStructureStatus(`CRITICAL ERROR: ${error.message}. Check console.`, 'error');
            } finally { mcstructureGenerateButton.disabled = false; console.log("--- MCStructure Script Finished ---"); }
        });
    }

    // --- Schematic to MCStructure Setup ---
    function showSchemMcstructureStatus(message, type) {
        if (!schemMcstructureStatusDiv) return;
        schemMcstructureStatusDiv.textContent = message;
        schemMcstructureStatusDiv.className = 'status-message';
        schemMcstructureStatusDiv.classList.add(type);
        schemMcstructureStatusDiv.style.display = 'block';
    }
    
    function resetSchemMcstructureUI() {
        if(schemMcstructureStatusDiv) schemMcstructureStatusDiv.style.display = 'none';
        if(schemMcstructureLogViewer) schemMcstructureLogViewer.style.display = 'none';
        if(schemMcstructureLogPreview) schemMcstructureLogPreview.textContent = '';
        if(schemMcstructureConvertButton) {
            schemMcstructureConvertButton.disabled = false;
            schemMcstructureConvertButton.innerHTML = '<i class="fas fa-cogs"></i> Convert to .mcstructure';
        }
    }
    
    if (schemMcstructureDropArea) {
        setupDropAreaListeners(schemMcstructureDropArea, schemMcstructureInputFile, schemMcstructureFileNameDisplay);
        setupFileInputHandler(schemMcstructureInputFile, (file) => {
            schemMcstructureFileObject = file;
            resetSchemMcstructureUI();
        }, schemMcstructureFileNameDisplay, schemMcstructureStatusDiv, ['.schem', '.schematic']);
    }

    if (schemMcstructureDownloadLogButton) {
        schemMcstructureDownloadLogButton.addEventListener('click', () => {
            if (schemMcstructureLogPreview.textContent && schemMcstructureFileObject) {
                const outputFileName = schemMcstructureFileObject.name.replace(/\.schem(atic)?$/i, '_translation_log.txt');
                downloadFile(schemMcstructureLogPreview.textContent, outputFileName, 'text/plain;charset=utf-8');
            }
        });
    }

    if (schemMcstructureConvertButton) {
        schemMcstructureConvertButton.addEventListener('click', async () => {
            if (!schemMcstructureFileObject) {
                showSchemMcstructureStatus('Please select a .schem or .schematic file first!', 'error');
                return;
            }
            if (typeof window.convertSchemToMcStructure !== 'function') {
                showSchemMcstructureStatus('ERROR: Core conversion script is not loaded.', 'error');
                return;
            }

            resetSchemMcstructureUI();
            showSchemMcstructureStatus('Starting conversion... This may take a moment.', 'info');
            schemMcstructureConvertButton.disabled = true;
            schemMcstructureConvertButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Converting...';

            try {
                const schemBuffer = await schemMcstructureFileObject.arrayBuffer();
                const { mcstructureBuffer, log } = await window.convertSchemToMcStructure(schemBuffer);

                const outputFileName = schemMcstructureFileObject.name.replace(/\.schem(atic)?$/i, '.mcstructure');
                downloadFile(mcstructureBuffer, outputFileName, 'application/octet-stream');
                
                showSchemMcstructureStatus(`Success! Conversion complete. Downloading ${outputFileName}.`, 'success');
                schemMcstructureLogPreview.textContent = log;
                schemMcstructureLogViewer.style.display = 'block';

            } catch (result) {
                const { error, log } = result;
                console.error("Schem to MCStructure Conversion Failed:", error);
                showSchemMcstructureStatus(`ERROR: ${error.message}. Check log below for details.`, 'error');
                schemMcstructureLogPreview.textContent = log || "Log could not be generated.";
                schemMcstructureLogViewer.style.display = 'block';
            } finally {
                schemMcstructureConvertButton.disabled = false;
                schemMcstructureConvertButton.innerHTML = '<i class="fas fa-cogs"></i> Convert to .mcstructure';
            }
        });
    }

    console.log("Blacklight NBT script initialized successfully.");
});