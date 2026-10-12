import fs from 'fs';
import path from 'path';
import { RenderJob, templateFile } from '../frames';

const selectTemplateCard = async (job: RenderJob) => {
    return fs.readFileSync(path.join('./src/templates', templateFile(job)));
}

export default selectTemplateCard
