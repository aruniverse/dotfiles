#!/usr/bin/sh

# Get vim all set up
rm -f ~/.vimrc
ln -s $PWD/.vimrc ~/.vimrc

# install vundle and all other plugins
mkdir -p ~/.vim/bundle
git clone https://github.com/VundleVim/Vundle.vim.git ~/.vim/bundle/Vundle.vim
git clone https://github.com/scrooloose/nerdtree.git ~/.vim/bundle/nerdtree
git clone https://github.com/airblade/vim-gitgutter.git ~/.vim/bundle/vim-gitgutter
git clone https://github.com/vim-syntastic/syntastic.git ~/.vim/bundle/syntastic
vim +PluginInstall +qall
