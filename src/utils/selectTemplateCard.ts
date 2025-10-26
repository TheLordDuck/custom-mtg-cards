import fs from 'fs';

const selectTemplateCard = async (type: string) => {
    if (type.includes('Creature')) {
        return fs.readFileSync('./src/templates/creature_layout.png');
    } else {
        return fs.readFileSync('./src/templates/general_layout.png');
    }
}

export default selectTemplateCard