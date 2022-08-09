import './App.css';
import useToken from './useToken';
import Login from './Login';

import axios from "axios";

import { parseProgram } from 'scope-script-parser';

import CodeMirror from '@uiw/react-codemirror';
import 'codemirror/keymap/sublime';
import 'codemirror/theme/material-darker.css';

import { Button, Icon, IconButton, ButtonGroup } from '@mui/material';
import { Dialog, DialogActions, DialogTitle, TextField } from '@mui/material';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { List, ListItemSecondaryAction, ListItemButton, ListItemText, ListItem } from '@mui/material';

import { useRef, useState, useEffect } from 'react';

const theme = createTheme({
  palette: {
    primary: {
      main: '#304ffe',
    },
    secondary: {
      main: '#dd2c00'
    }
  },
});

export const api = axios.create({
  baseURL: 'http://localhost:5000'
})

export const App = () => {
  // IDE Hooks
  const { token, setToken, removeToken } = useToken();
  const [output, setOutput] = useState('')
  const [status, setStatus] = useState('')
  const [file, setFile ] = useState({title: token ? '' : "untitled.sc", id: null, code: ''})
  const [nextId, setNextId] = useState(null);
  const [fileList, setFileList] = useState([]);
  const [hasChange, setHasChange] = useState(false);
  const [openClear, setOpenClear] = useState(false);
  const [openNewFile, setOpenNewFile] = useState(false);
  const [openNoSave, setOpenNoSave] = useState(false);
  const [delButtons, setDelButtons] = useState(false);
  const [interpError, setInterpError] = useState(false);
  const [fileName, setFileName] = useState("");
  const [nameError, setNameError] = useState([]);
  const [tokenExpired, setTokenExpired] = useState(false);
  const [running, setRunning] = useState(false)
  // Run abort controller.
  const abortController = useRef(null);

  // IDE Handles

  const handleClear = () => { setOutput(''); setStatus(''); setFile({...file, code: ''}); setOpenClear(false) };

  const handleOpenNewFile = () => { setFileName(""); setOpenNewFile(true) }

  const handleCloseNewFile = () => { setFileName(""); setNameError([false]); setOpenNewFile(false) };

  const handleUnsavedSave = () => { saveFile(); loadFile(nextId); setOpenNoSave(false) };

  const handleUnsavedIgnore = () => { loadFile(nextId); setOpenNoSave(false) };

  const handleStop = () => abortController.current && abortController.current.abort()

  const logOut = () => {
    setFileList([]);
    setFile({title: "untitled.sc", id: null, code:''})
    setOutput('');
    setStatus('');
    setHasChange(false);
    removeToken();
  }

  const handleLoadFile = (id) => {
    setDelButtons(false);
    if (file.id !== id) {
      if (!hasChange || !file.id) {
        loadFile(id)
      } else {
        setNextId(id); 
        setOpenNoSave(true); 
      } 
    }
  }

  const handleNewFile = () => {
    const err = invalidInput()
    setNameError(err);
    if (!err[0]) {
      newFile(fileName);
      handleCloseNewFile();
    }
  };

  const invalidInput = () => {
    const f_name = fileName.trim().toLowerCase()
    const name_arr = f_name.split('.');
    if (name_arr.length !== 2 || name_arr[1] !== 'sc') {
      return [true, "File name must end in '.sc'."]
    }
    if (name_arr[0].includes(" ")) {
      return [true, "File name must be one word."];
    }
    if (name_arr[0].length > 100) {
      return [true, "Max character limit exceeded."];
    }
    if (fileList.reduce((acc, e) => acc || (e.title.toLowerCase() === f_name), false)) {
      return [true, "Dulpicate file name."] 
    }
    return [false];
  }

  const refresh = tok => {
    if (tok) {
      setToken({...token, access_token: tok})
    }
  }  
  
  // User api calls
  const runCode = async () => {
    setRunning(true)
    abortController.current = new AbortController() 
    setStatus('Starting program... ')
    await api.post(`/interp`, parseProgram(file.code), token ? {
      headers: {
        'Authorization': `Bearer ${token.access_token}` 
      }, signal: abortController.current.signal
    }: { signal: abortController.current.signal })
    .then(response => {
      setRunning(false)
      const data = response.data
      refresh(data.access_token);
      if (data.kind === 'error') {
        setInterpError(true)
        setStatus('Program error.')
      } else {
        setInterpError(false)
        setStatus('Program terminated successfully.')
      }
      setOutput(data.output);
    }).catch(err => {
      setRunning(false)
      if (err.message === 'canceled') {
        setStatus('Program aborted.')
      }
    })
  }

  const handleUnAuth = (err) => {
    if (err.response.status === 401) {
      logOut();
      setTokenExpired(true);
    } else {
      console.log(err);
    }
  }

  const newFile = async (title) => {
    try {
      const { data } = await api.post(`/new-file`, {title: title, code: ""}, {
        headers: {
          'Authorization': `Bearer ${token.access_token}` 
        }
      })
      refresh(data.access_token); 
      setFileList([...fileList, data.file]);
      handleLoadFile(data.file.id);
    } catch(err) {
      handleUnAuth(err);
    }
  }

  const deleteFile = async (id) => {
    try {
      const {data} = await api.delete(`/fetch-file/${id}`,{
        headers: {
          'Authorization': `Bearer ${token.access_token}` 
        }
      })
      if (id === file.id) {
        const nextFile = data.next_file
        if (nextFile) {
          loadFile(nextFile);
        } else {
          setFile({title: '', id: null, code:''})
          setOutput('')
          setStatus('')
        }
      }
      refresh(data.access_token);
      setDelButtons(false);
      setFileList(fileList.filter(f => f.id !== id));
    } catch (err) {
      handleUnAuth(err);
    }
  }

  const loadFile = async (id) => {
    try {
      const { data } = await api.get(`/fetch-file/${id}`, {
        headers: {
          'Authorization': `Bearer ${token.access_token}` 
        }
      })
      refresh(data.access_token);
      setFile(data.file);
      setOutput('');
      setStatus('');
      setHasChange(false);
      setDelButtons(false);
    } catch (err) {
      handleUnAuth(err)
    }
  }

  const saveFile = async () => {
   try {
      const { data } = await api.put(`/fetch-file/${file.id}`, { code: file.code }, {
        headers: {
          'Authorization': `Bearer ${token.access_token}` 
        }
      });
      refresh(data.access_token);
      setHasChange(false);
    } catch(err) {
      handleUnAuth(err);
    }
  }

  const fetchFiles = async () => {
    try {
      const { data } = await api.get(`/fetch-files`,{
        headers: {
          'Authorization': `Bearer ${token.access_token}` 
        }
      });
      refresh(data.access_token);
      setFileList(data.files);
    } catch(err) {
      handleUnAuth(err);
    }
  }

  const downloadCode = () => {
    const element = document.createElement("a");
    const download = new Blob([file.code], { type: "text/plain" });
    element.href = URL.createObjectURL(download);
    element.download = `${file.title.split('.')[0] + ".txt"}`;
    document.body.appendChild(element);
    element.click();
  };

  // Fetch files if logged in.
  useEffect(() => {
    if (token) {
      fetchFiles();
    }
  }, [token])

  return (
  <div className="wrapper">
    <link href="https://fonts.googleapis.com/icon?family=Material+Icons"rel="stylesheet"></link>
    <ThemeProvider theme={theme}>
    <div className="header"><div className="headerText">ScopeScript <Icon size='larger'>dynamic_feed</Icon></div>
      <Button sx={{color: 'white'}} align='right' onClick={() => window.open("https://github.com/danpaxton/scope-script-parser/blob/main/README.md")}>language information</Button>
    </div>
    <Login token={token} setToken={setToken} setFile={setFile}
        setOutput={setOutput} setStatus={setStatus} logOut={logOut}/>
    <div className="sidebar">
        <Dialog open={openNewFile} aria-labelledby="alert-dialog-title"> 
            <DialogActions>
              <TextField id="standard-basic" error={nameError[0]} label={nameError[0] ? nameError[1]: "Enter file name."} 
                variant="standard" onChange={f => setFileName(f.target.value)}/>
              <Button variant="contained" size='small' color="primary" onClick={handleNewFile}>Enter</Button>
              <Button variant="contained" size='small' color="secondary" onClick={handleCloseNewFile}>Cancel</Button>
            </DialogActions> 
          </Dialog>
        <div className='listHeader'>
          <ButtonGroup variant="text" fullWidth={true}>
            <Button color="primary" disabled={!token} onClick={handleOpenNewFile} > <Icon>post_add</Icon>New File</Button>
            <Button color="secondary" disabled={!token || !fileList.length} onClick={() => setDelButtons(!delButtons)}> <Icon>delete</Icon>Delete</Button>
          </ButtonGroup>
        </div>
        <div className='changes'>{ token ? (file.id ? (hasChange ? `Unsaved changes.` :  "All changes saved.") : "Create or load file.") : "Login to create files." }</div>
        <div className='list'>
          <List dense={true}>
          {fileList.map(curr_file => (
            <ListItem disablePadding key={curr_file.id} 
              sx={{"&& .Mui-selected": { backgroundColor: "rgba(48, 79, 254, .3)" },
                "&:hover": { backgroundColor: 'rgba(255, 255, 255, .3)'}, width: '400px'}}>
            <ListItemButton selected={curr_file.id === file.id} onClick={() => handleLoadFile(curr_file.id)}> 
              <ListItemText sx={{fontFamily: "monospace"}} primary={curr_file.title}/>
            </ListItemButton>
            <ListItemSecondaryAction>
                { delButtons ? <IconButton size='small' color='secondary' onClick={() => deleteFile(curr_file.id)}>
                  <Icon>delete</Icon></IconButton> : null}
              </ListItemSecondaryAction>
            </ListItem>)
          )}
          </List>
        </div>
    </div>
    <div className="content">
          <div className="contentButtons"> 
            <Button variant="text" color="primary" disabled={running || (token && !file.id)} onClick={runCode} > 
              <Icon>play_arrow</Icon>Run</Button>
            <Button variant="text" color="secondary" disabled={!running} onClick={handleStop}> 
              <Icon>stop</Icon>Stop</Button>
            <Button variant="text" color="primary" disabled={!file.id || !hasChange} onClick={saveFile}>
              <Icon>playlist_add_check</Icon>Save</Button>
            <Button variant="text" color="primary" disabled={token && !file.id} onClick={downloadCode} > 
              <Icon>download</Icon>Download</Button>
            <Button variant="text" color="secondary" disabled={token && !file.id} onClick={() => setOpenClear(true)} >
              <Icon>refresh</Icon>Clear </Button>
          </div>
          <Dialog open={openClear}>
            <DialogTitle sx={{fontSize: 17, textAlign:'center'}} id="alert-dialog-title">{"Clear all code?"}</DialogTitle>
            <DialogActions>
              <Button variant="contained" size='small' color="primary" onClick={() => setOpenClear(false)}>Cancel</Button>
              <Button variant="contained" size='small' color="secondary" onClick={handleClear}>Clear</Button>
            </DialogActions> 
          </Dialog>
          <Dialog open={openNoSave} aria-labelledby="alert-dialog-title">
            <DialogTitle sx={{fontSize: 17, textAlign:'center'}} id="alert-dialog-title">{"Unsaved Changes."}</DialogTitle>
            <DialogActions>
              <Button variant="contained" size='small' color="primary" onClick={handleUnsavedSave}>Save Changes</Button>
              <Button variant="contained" size='small' color="secondary" onClick={handleUnsavedIgnore}>Ignore</Button>
            </DialogActions> 
          </Dialog>
          <CodeMirror
              value={file.code}
              options={{
                readOnly: token && !file.id ? 'nocursor': false,
                theme: "material-darker",
                keymap: "sublime",
                mode: "jsx"
              }}
              onChange={(editor, change) => {
                setHasChange(true);
                setFile({...file, code: editor.getValue()});
              }}
            />
          </div>
          <div className="footer">
            <div className='footerHeader'>
             <Icon>output</Icon>: {status}
            </div>
            <div className='footerContent' style={{ color: interpError ? '#ff6e40' : '#536dfe' }}>
              {output}
              </div>
          </div>
          <Dialog open={tokenExpired}>
            <DialogTitle sx={{fontSize: 17, textAlign:'center'}}>{"Access token has expired. Logging out."}</DialogTitle>
            <DialogActions>
              <Button variant="contained" size='small' color="primary" onClick={() => setTokenExpired(false)}>OK</Button>
            </DialogActions> 
          </Dialog>
  </ThemeProvider>
</div>)
}